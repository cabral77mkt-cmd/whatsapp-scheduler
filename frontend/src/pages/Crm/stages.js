export const STAGES = [
  { id: 'entrou_contato',      label: 'Entrou em contato',  color: 'bg-slate-500',   border: 'border-slate-500'   },
  { id: 'conversando',         label: 'Conversando',         color: 'bg-blue-500',    border: 'border-blue-500'    },
  { id: 'diagnostico',         label: 'Diagnóstico',         color: 'bg-cyan-500',    border: 'border-cyan-500'    },
  { id: 'reuniao_agendada',    label: 'Reunião agendada',    color: 'bg-indigo-500',  border: 'border-indigo-500'  },
  { id: 'reuniao_realizada',   label: 'Reunião realizada',   color: 'bg-violet-500',  border: 'border-violet-500'  },
  { id: 'aguardando_proposta', label: 'Aguardando proposta', color: 'bg-amber-500',   border: 'border-amber-500'   },
  { id: 'proposta_enviada',    label: 'Proposta enviada',    color: 'bg-orange-500',  border: 'border-orange-500'  },
  { id: 'analisando_proposta', label: 'Analisando proposta', color: 'bg-yellow-500',  border: 'border-yellow-500'  },
  { id: 'negociacao',          label: 'Negociação',          color: 'bg-pink-500',    border: 'border-pink-500'    },
  { id: 'fechado',             label: 'Fechado',             color: 'bg-emerald-500', border: 'border-emerald-500' },
  { id: 'perdido',             label: 'Perdido',             color: 'bg-red-500',     border: 'border-red-500'     },
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map(s => [s.id, s]));

export const TEMPERATURE = {
  frio:   { label: '🥶 Frio',   chip: 'bg-sky-600/30 text-sky-300' },
  morno:  { label: '🌤️ Morno',  chip: 'bg-amber-600/30 text-amber-300' },
  quente: { label: '🔥 Quente', chip: 'bg-red-600/30 text-red-300' },
};

export const LOSS_REASONS = [
  'Achou caro',
  'Fechou com outro',
  'Demorou para decidir',
  'Evento muito em cima',
  'Não respondeu mais',
  'Não era o perfil ideal',
  'Outro motivo'
];

export const TEMPLATE_KEYS = [
  // Sem resposta
  { key: 'no_reply_24h',    label: 'Sem resposta — 24h' },
  { key: 'no_reply_48h',    label: 'Sem resposta — 48h' },
  { key: 'no_reply_7d',     label: 'Sem resposta — 7 dias' },
  // Reunião
  { key: 'meeting_confirmation', label: 'Confirmação de reunião agendada' },
  { key: 'meeting_morning', label: 'Lembrete reunião — manhã (08:00)', hint: 'Use [HORARIO] para inserir o horário da reunião.' },
  { key: 'meeting_30min',   label: 'Lembrete reunião — 30 min antes', hint: 'Use [HORARIO] para inserir o horário da reunião.' },
  { key: 'post_meeting',    label: 'Pós-reunião — follow-up' },
  // Proposta
  { key: 'proposal_24h',    label: 'Proposta enviada — 24h' },
  { key: 'proposal_3d',     label: 'Proposta enviada — 3 dias' },
  { key: 'proposal_5d',     label: 'Proposta enviada — 5 dias' },
  // Analisando
  { key: 'analyzing_2d',    label: 'Analisando proposta — 2 dias' },
  { key: 'analyzing_5d',    label: 'Analisando proposta — 5 dias' },
  // Fechado / Perdido
  { key: 'closed_welcome',  label: 'Boas-vindas após fechamento' },
  { key: 'lost_30d',        label: 'Reativação de perdido — 30 dias' },
  { key: 'lost_60d',        label: 'Reativação de perdido — 60 dias' },
  { key: 'lost_90d',        label: 'Reativação de perdido — 90 dias' },
  // Urgência por evento
  { key: 'event_urgency',   label: 'Urgência — evento em até 30 dias', hint: 'Use {nome}, {evento}, {dias}, {data}, {cidade}.' },
];

export const TEMPLATE_HINTS = {
  no_reply_24h: 'Oi, tudo bem? Vi que você passou por aqui mais cedo. Consegue me contar um pouco do seu evento? Quero entender direito antes de propor qualquer coisa.',
  no_reply_48h: 'Oi! Só voltei pra cá pra ver se faz sentido a gente trocar uma ideia sobre o marketing do seu evento. Se for melhor outro horário, me avisa.',
  no_reply_7d:  'Oi! Como evento trabalha contra o tempo, achei importante te chamar mais uma vez. Se ainda fizer sentido conversar sobre divulgação, me responde aqui.',
  meeting_confirmation: 'Boa! Reunião confirmada. Te vejo no dia combinado. Se precisar ajustar alguma coisa antes, pode me chamar aqui.',
  meeting_morning: 'Bom dia! Tudo certo? Passando só pra confirmar nossa reunião de hoje às [HORARIO]. Vamos conversar sobre a divulgação do seu evento e ver o melhor caminho pra melhorar as vendas. Até mais tarde!',
  meeting_30min:   'Oi! Passando só pra lembrar que nossa reunião é daqui 30 minutos, às [HORARIO]. Já deixei tudo preparado por aqui pra gente conversar sobre o seu evento.',
  post_meeting: 'Oi! Foi ótimo conversar. Agora vou organizar tudo que discutimos e te mando a proposta em breve. Qualquer dúvida, me chama aqui.',
  proposal_24h: 'Oi, tudo bem? Passando só pra saber se você conseguiu olhar a proposta que te enviei. A ideia é a gente estruturar uma campanha que ajude seu evento a vender com mais estratégia, sem depender só de postagem solta.',
  proposal_3d:  'Oi! Só retomando nossa conversa sobre o marketing do seu evento. Como evento tem prazo, quanto antes a gente organizar a campanha, melhor conseguimos trabalhar criativos, tráfego e estratégia de venda.',
  proposal_5d:  'Passando pra saber se faz sentido a gente avançar com a divulgação do seu evento. Se tiver alguma dúvida sobre a proposta, consigo te explicar ponto por ponto.',
  analyzing_2d: 'Oi, tudo bem? Sei que às vezes precisa alinhar com sócio/equipe antes de decidir. Só passando pra deixar aberto: se tiver qualquer dúvida sobre a proposta ou quiser ajustar algo pra fazer sentido pro evento, me chama por aqui.',
  analyzing_5d: 'Oi! Como o evento trabalha contra o tempo, achei importante te chamar mais uma vez. Se ainda fizer sentido estruturar a campanha, podemos ajustar o melhor formato e começar do jeito certo.',
  closed_welcome: 'Fechado então! Vou organizar tudo por aqui e já te passo os próximos passos pra começarmos a campanha do seu evento da forma certa.',
  lost_30d: 'Oi! Passando pra dar um alô. Sei que na época não fechamos, mas fico por aqui caso você tenha outro evento chegando. Boa sorte no próximo!',
  lost_60d: 'Oi, tudo bem? Lembrei de você! Se tiver planejando algum evento, seria um prazer conversar sobre como a gente pode ajudar na divulgação.',
  lost_90d: 'Oi! Três meses depois, passando só pra dizer que estamos com novidades e cases novos de eventos. Se quiser trocar uma ideia, estou por aqui.',
  event_urgency: 'Oi, {nome}! Passando pra te lembrar que o {evento} está chegando — faltam só {dias} dias! 🚀 Se ainda não fechamos a campanha de divulgação, essa é a hora de colocar tudo nos trilhos. Me chama aqui pra a gente resolver rápido!',
};
