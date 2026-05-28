# Biblioteca de Componentes UI

Todos os componentes vivem em `frontend/src/components/ui/` e consomem os design tokens do arquivo `src/styles/tokens.css`. Importe pelo barrel:

```js
import { Button, Input, Badge, Modal, Card, MetricCard } from '../components/ui';
```

---

## Tokens de design

Os tokens CSS estão em `src/styles/tokens.css`. Use sempre via variável — nunca hardcode cores.

| Token                  | Valor padrão   | Uso                        |
|------------------------|----------------|----------------------------|
| `--bg-canvas`          | `#0a0a0a`      | Fundo da página            |
| `--bg-surface`         | `#111111`      | Cards, modais              |
| `--bg-surface-2`       | `#1a1a1a`      | Inputs, hover              |
| `--gold-400`           | `#F5C46B`      | Texto dourado, hover       |
| `--gold-500`           | `#D4AF37`      | Botão primary, acento      |
| `--text-primary`       | `#FAFAFA`      | Textos principais          |
| `--text-secondary`     | `#A1A1AA`      | Subtextos                  |
| `--text-muted`         | `#71717A`      | Labels, hints              |
| `--border-default`     | `#1F1F1F`      | Bordas de card             |
| `--border-strong`      | `#2A2A2A`      | Inputs focus               |

---

## Button

```jsx
import { Button } from '../components/ui';

// Variantes
<Button variant="primary">Salvar</Button>
<Button variant="danger">Excluir</Button>
<Button variant="ghost">Cancelar</Button>
<Button variant="outline">Exportar</Button>

// Tamanhos
<Button size="sm">Pequeno</Button>
<Button size="md">Médio (padrão)</Button>
<Button size="lg">Grande</Button>

// Estado de loading
<Button loading={salvando}>Salvar</Button>

// Desabilitado
<Button disabled>Indisponível</Button>
```

**Props:**

| Prop        | Tipo      | Default     | Valores válidos                            |
|-------------|-----------|-------------|-------------------------------------------|
| `variant`   | string    | `'primary'` | `primary` `danger` `ghost` `outline`      |
| `size`      | string    | `'md'`      | `sm` `md` `lg`                            |
| `loading`   | boolean   | `false`     | Mostra spinner e desabilita o botão        |
| `disabled`  | boolean   | `false`     | Desabilita o botão                         |
| `className` | string    | `''`        | Classes Tailwind adicionais               |
| `...rest`   | —         | —           | Todos os attrs nativos do `<button>`      |

Internamente usa as classes CSS `.btn-primary`, `.btn-danger`, etc. do `index.css`.

---

## Input

```jsx
import { Input } from '../components/ui';

<Input placeholder="Nome do lead" />
<Input type="email" placeholder="E-mail" />
<Input error="Campo obrigatório" />

// Controlled
<Input value={nome} onChange={e => setNome(e.target.value)} />
```

**Props:**

| Prop          | Tipo    | Default | Descrição                          |
|---------------|---------|---------|------------------------------------|
| `error`       | string  | —       | Mensagem de erro (exibe em vermelho abaixo) |
| `className`   | string  | `''`    | Classes adicionais                 |
| `...rest`     | —       | —       | Todos os attrs do `<input>`        |

---

## Textarea

```jsx
import { Textarea } from '../components/ui';

<Textarea rows={4} placeholder="Observações…" />
<Textarea error="Preenchimento obrigatório" />
```

Mesmas props que `Input`, com `rows` adicional.

---

## TextareaWithSnippets

Textarea inteligente com suporte a snippets (`/shortcut`) e IA reescrita.

```jsx
import { TextareaWithSnippets } from '../components/ui';

<TextareaWithSnippets
  value={mensagem}
  onChange={e => setMensagem(e.target.value)}
  placeholder="Digite ou use / para snippets…"
  leadId={lead.id}
  leadName={lead.name}
  eventName={lead.event_name}
/>
```

**Comportamento:**
- Digitar `/` abre dropdown com snippets filtrados em tempo real.
- `↑↓` navega, `Enter`/`Tab` insere, `Esc` fecha.
- Variáveis `{nome}`, `{evento}`, `{telefone}` são expandidas automaticamente.
- Botão `✨ Reescrever` chama Claude com 4 opções de tom: Amigável, Formal, Mais curta, Com urgência.

---

## Select

```jsx
import { Select } from '../components/ui';

<Select
  options={[
    { value: 'fechado', label: 'Fechado' },
    { value: 'perdido', label: 'Perdido' },
  ]}
  value={stage}
  onChange={e => setStage(e.target.value)}
  placeholder="Selecione uma etapa"
/>
```

---

## Card

```jsx
import { Card } from '../components/ui';

<Card>
  <p>Conteúdo aqui</p>
</Card>

<Card padding="sm" className="border-amber-500">
  Variante com padding reduzido
</Card>
```

**Props:**

| Prop        | Tipo   | Default | Valores          |
|-------------|--------|---------|------------------|
| `padding`   | string | `'md'`  | `sm` `md` `lg`   |
| `className` | string | `''`    | Classes adicionais |

---

## Badge

```jsx
import { Badge } from '../components/ui';

<Badge variant="gold">Quente</Badge>
<Badge variant="success">Fechado</Badge>
<Badge variant="warning">Aguardando</Badge>
<Badge variant="danger">Perdido</Badge>
<Badge variant="info">Novo</Badge>
<Badge variant="muted">Inativo</Badge>
```

**Variantes:**

| Variant     | Cor de fundo       | Cor do texto      |
|-------------|--------------------|-------------------|
| `gold`      | dourado/15%        | `--gold-400`      |
| `success`   | emerald/15%        | `#10B981`         |
| `warning`   | amber/15%          | `#F59E0B`         |
| `danger`    | red/15%            | `#EF4444`         |
| `info`      | blue/15%           | `#60A5FA`         |
| `muted`     | zinc/15%           | `--text-muted`    |

---

## Avatar

```jsx
import { Avatar } from '../components/ui';

// Com imagem
<Avatar src="/uploads/foto.jpg" name="Ana Lima" size={32} />

// Sem imagem — exibe iniciais
<Avatar name="Carlos Mendes" size={40} />

// Tamanhos comuns
<Avatar name="JD" size={24} />  // pequeno (sidebar)
<Avatar name="JD" size={32} />  // médio (listas)
<Avatar name="JD" size={48} />  // grande (perfil)
```

---

## Modal

```jsx
import { Modal } from '../components/ui';

<Modal
  open={showModal}
  onClose={() => setShowModal(false)}
  title="Confirmar exclusão"
  maxWidth="max-w-md"
  footer={
    <>
      <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
      <Button variant="danger" onClick={handleDelete}>Excluir</Button>
    </>
  }
>
  <p>Tem certeza que deseja excluir este lead?</p>
</Modal>
```

**Props:**

| Prop       | Tipo    | Default      | Descrição                     |
|------------|---------|--------------|-------------------------------|
| `open`     | boolean | —            | Controla visibilidade         |
| `onClose`  | fn      | —            | Chamado ao clicar no overlay ou pressionar Esc |
| `title`    | string  | —            | Título do header              |
| `maxWidth` | string  | `'max-w-lg'` | Classe Tailwind de largura    |
| `footer`   | node    | —            | Botões de ação no rodapé      |

---

## Drawer

```jsx
import { Drawer } from '../components/ui';

<Drawer
  open={showDrawer}
  onClose={() => setShowDrawer(false)}
  title="Detalhes do Lead"
  side="right"
  width="w-96"
>
  <p>Conteúdo do drawer</p>
</Drawer>
```

**Props:**

| Prop    | Tipo    | Default    | Valores         |
|---------|---------|------------|-----------------|
| `open`  | boolean | —          | —               |
| `side`  | string  | `'right'`  | `right` `left`  |
| `width` | string  | `'w-96'`   | Classe Tailwind |

---

## Tabs

```jsx
import { Tabs } from '../components/ui';

const TABS = [
  { id: 'visao-geral', label: '📊 Visão Geral' },
  { id: 'historico',   label: '📋 Histórico'   },
  { id: 'config',      label: '⚙️ Config'       },
];

<Tabs tabs={TABS} active={tab} onChange={setTab} />

{tab === 'visao-geral' && <p>Conteúdo visão geral</p>}
{tab === 'historico'   && <p>Conteúdo histórico</p>}
```

---

## MetricCard

KPI card com valor principal, badge de tendência e subtítulo. Usado no Dashboard e Gestão.

```jsx
import { MetricCard } from '../components/ui';

<MetricCard
  icon="💰"
  label="Faturamento do Mês"
  value="R$ 87.400"
  sub="12 negócios fechados"
  trend={12.5}
  trendLabel="vs mês anterior"
/>

// Sem tendência
<MetricCard
  icon="👥"
  label="Leads Ativos"
  value={142}
/>

// Cor customizada (padrão: dourado)
<MetricCard
  label="Reuniões Hoje"
  value={3}
  color="#10B981"
  icon="📅"
/>

// Clicável
<MetricCard
  label="Follow-ups Pendentes"
  value={8}
  icon="📨"
  onClick={() => navigate('/crm/followups')}
/>
```

**Props:**

| Prop         | Tipo   | Default       | Descrição                               |
|--------------|--------|---------------|-----------------------------------------|
| `label`      | string | —             | Label em uppercase acima do valor       |
| `value`      | any    | —             | Valor principal (string ou número)      |
| `sub`        | string | —             | Subtítulo abaixo do valor               |
| `icon`       | string | —             | Emoji no canto superior direito         |
| `trend`      | number | —             | % de variação (positivo=▲ verde, negativo=▼ vermelho) |
| `trendLabel` | string | —             | Texto após o badge de tendência         |
| `color`      | string | `--gold-400`  | Cor CSS do valor principal              |
| `onClick`    | fn     | —             | Torna o card clicável                   |

---

## Skeleton

Placeholder de carregamento animado. Use enquanto dados estão sendo buscados.

```jsx
import { Skeleton } from '../components/ui';

// Linha de texto
<Skeleton className="h-4 w-48" />

// Bloco de card
<Skeleton className="h-24 w-full rounded-xl" />

// Avatar
<Skeleton className="h-8 w-8 rounded-full" />
```

---

## EmptyState

```jsx
import { EmptyState } from '../components/ui';

<EmptyState
  icon="📭"
  title="Nenhum lead encontrado"
  description="Tente ajustar os filtros ou crie um novo lead."
  action={
    <Button onClick={() => setShowNew(true)}>+ Novo Lead</Button>
  }
/>
```

---

## Tooltip

```jsx
import { Tooltip } from '../components/ui';

<Tooltip content="Clique para copiar o link">
  <button>📋 Copiar</button>
</Tooltip>
```

O tooltip aparece acima do elemento por padrão, com delay de 300ms.

---

## Convenções

1. **Nunca usar cores hardcoded** — sempre `var(--token-name)` ou as classes CSS do `index.css`.
2. **Classes utilitárias globais** disponíveis: `.card`, `.input`, `.btn-primary`, `.btn-danger`, `.btn-ghost`, `.btn-outline-gold`, `.badge`, `.badge-gold`, `.badge-success` etc.
3. **Mobile-first** — qualquer novo componente deve funcionar em viewport 375px.
4. **`className` é sempre passthrough** — nunca sobrescreva estilos, adicione via `className` extra.
5. **Estados de loading** — use `Skeleton` durante fetch, nunca deixe a tela vazia.
