# API Pública v1 — Documentação

Base URL: `https://seu-dominio.com/api/v1`

Todas as requisições precisam de autenticação via **API Key** gerada em `CRM → Configurações → API Keys`.

---

## Autenticação

```http
Authorization: Bearer <sua-api-key>
```

A chave é gerada por usuário — ela identifica o vendedor que está realizando a operação.

---

## Leads

### Listar leads

```http
GET /api/v1/leads
```

**Query params:**

| Parâmetro | Tipo   | Descrição                              |
|-----------|--------|----------------------------------------|
| `stage`   | string | Filtrar por etapa (ver lista abaixo)   |
| `q`       | string | Busca por nome ou telefone             |
| `page`    | number | Página (default: 1)                    |
| `limit`   | number | Resultados por página (default: 50, max: 200) |

**Etapas válidas:** `entrou_contato` `conversando` `diagnostico` `reuniao_agendada` `reuniao_realizada` `aguardando_proposta` `proposta_enviada` `analisando_proposta` `negociacao` `fechado` `perdido`

**Resposta 200:**

```json
{
  "total": 142,
  "page": 1,
  "limit": 50,
  "leads": [
    {
      "id": 17,
      "name": "Ana Lima",
      "phone": "5511999990000",
      "stage": "proposta_enviada",
      "temperature": "quente",
      "source": "whatsapp_dm",
      "created_at": "2026-04-10T14:22:00.000Z",
      "updated_at": "2026-05-01T09:10:00.000Z",
      "event_name": "Festival Rock 2026",
      "city": "São Paulo"
    }
  ]
}
```

---

### Buscar lead por ID

```http
GET /api/v1/leads/:id
```

**Resposta 200:** objeto completo do lead com todos os campos.

**Resposta 404:**

```json
{ "error": "Lead não encontrado" }
```

---

### Criar lead

```http
POST /api/v1/leads
Content-Type: application/json
```

**Body:**

```json
{
  "phone":  "5511999990000",
  "name":   "Carlos Mendes",
  "stage":  "entrou_contato",
  "source": "landing_page",
  "notes":  "Veio do formulário de contato"
}
```

| Campo    | Obrigatório | Default           | Descrição           |
|----------|-------------|-------------------|---------------------|
| `phone`  | ✅           | —                 | Telefone no formato E.164 (sem +) |
| `name`   | ❌           | —                 | Nome do lead        |
| `stage`  | ❌           | `entrou_contato`  | Etapa inicial       |
| `source` | ❌           | `api_v1`          | Origem do lead      |
| `notes`  | ❌           | —                 | Observações         |

**Resposta 201:** objeto completo do lead criado.

**Resposta 400:**

```json
{ "error": "phone é obrigatório" }
```

---

### Mover estágio

```http
POST /api/v1/leads/:id/stage
Content-Type: application/json
```

**Body:**

```json
{ "stage": "proposta_enviada" }
```

**Resposta 200:**

```json
{ "ok": true, "stage": "proposta_enviada" }
```

A mudança de estágio dispara automaticamente:
- Registro no audit log
- Webhook outbound configurado (se houver)

---

## Pipeline

### Resumo por etapa

```http
GET /api/v1/pipeline
```

**Resposta 200:**

```json
[
  { "stage": "entrou_contato",   "count": 45, "total_value": 0 },
  { "stage": "proposta_enviada", "count": 12, "total_value": 187500 },
  { "stage": "fechado",          "count": 8,  "total_value": 96000 }
]
```

`total_value` é a soma do valor das propostas com status `sent` nos leads de cada etapa.

---

## Webhook Inbound (receber leads externos)

Endpoint genérico para receber leads de qualquer fonte externa (Zapier, Make, formulários, landing pages):

```http
POST /api/v1/inbound
Content-Type: application/json
```

**Body:**

```json
{
  "phone":      "5511999990000",
  "name":       "João Silva",
  "source":     "zapier",
  "event_name": "Casamento João e Maria",
  "stage":      "entrou_contato",
  "notes":      "Veio do Instagram Ads"
}
```

**Comportamento:**
- Se já existe um lead com o mesmo `phone`, retorna o existente sem criar duplicata.
- Se é novo, cria o lead e dispara o webhook outbound `lead.created`.

**Resposta 201 (criado):**

```json
{ "id": 99, "action": "created" }
```

**Resposta 200 (já existia):**

```json
{ "id": 42, "action": "existing" }
```

---

## Webhooks Outbound

Configure endpoints para receber notificações em `CRM → Configurações → Webhooks`.

### Eventos disparados

| Evento           | Quando ocorre                     |
|------------------|-----------------------------------|
| `lead.created`   | Novo lead criado via API v1       |
| `stage.changed`  | Estágio de um lead foi alterado   |
| `lead.closed`    | Lead marcado como `fechado`       |
| `lead.lost`      | Lead marcado como `perdido`       |
| `meeting.done`   | Reunião marcada como realizada    |
| `proposal.sent`  | Proposta enviada                  |

### Payload padrão

```json
{
  "event":     "stage.changed",
  "timestamp": "2026-05-22T10:30:00.000Z",
  "data": {
    "id":   17,
    "from": "conversando",
    "to":   "proposta_enviada"
  }
}
```

A plataforma realiza até **3 tentativas** com backoff exponencial em caso de falha (timeout 10s).

---

## Erros

| Código | Significado                                |
|--------|--------------------------------------------|
| `400`  | Parâmetro obrigatório ausente ou inválido  |
| `401`  | API Key ausente, inválida ou expirada      |
| `404`  | Recurso não encontrado                     |
| `500`  | Erro interno — contate o suporte          |

---

## Exemplos de integração

### Zapier (Trigger: novo lead no site)

1. Em Zapier, crie um **Zap** com trigger "Webhooks by Zapier → Catch Hook".
2. Copie a URL gerada pelo Zapier.
3. No seu site/formulário, faça POST para essa URL com os dados do lead.
4. Na ação do Zap, use **Webhooks by Zapier → POST** apontando para `/api/v1/inbound` com o header `Authorization: Bearer <sua-key>`.

### Make (antigo Integromat)

1. Crie um cenário com módulo **HTTP → Make a request**.
2. URL: `https://seu-dominio.com/api/v1/leads`
3. Method: POST
4. Headers: `Authorization: Bearer <sua-key>`, `Content-Type: application/json`
5. Body: JSON com os campos do lead.

### cURL

```bash
# Criar lead
curl -X POST https://seu-dominio.com/api/v1/leads \
  -H "Authorization: Bearer sk_v1_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"phone":"5511999990000","name":"Maria Silva","source":"curl_test"}'

# Listar pipeline
curl https://seu-dominio.com/api/v1/pipeline \
  -H "Authorization: Bearer sk_v1_xxxxxxxx"

# Mover estágio
curl -X POST https://seu-dominio.com/api/v1/leads/17/stage \
  -H "Authorization: Bearer sk_v1_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"stage":"fechado"}'
```

---

## Rate Limiting

Atualmente não há rate limiting implementado. Recomendamos no máximo **60 requisições/minuto** por API Key para não sobrecarregar o servidor.

---

## Changelog

| Versão | Data       | Mudanças                                      |
|--------|------------|-----------------------------------------------|
| v1.0   | 2026-01-15 | Endpoints iniciais: leads, pipeline, inbound  |
| v1.1   | 2026-03-10 | Adicionado `POST /leads/:id/stage`            |
| v1.2   | 2026-05-22 | Webhooks outbound para todos os eventos CRM   |
