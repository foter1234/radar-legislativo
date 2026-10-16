# Radar Legislativo

App para acompanhar o Congresso Nacional: **pauta por dia**, **histórico de votações com o voto de cada parlamentar** e **perfil de cada deputado/senador** (como votou, projetos apresentados, leis, presença). Dados abertos oficiais da Câmara e do Senado. Funciona no navegador e pode ser instalado no celular (PWA).

---

## Publicar de graça (Supabase + GitHub Actions + Render)

```
GitHub Actions (grátis)            Supabase (grátis)             Render (grátis)
importa a cada 6 h das APIs  ───►  Postgres com todo o     ◄───  servidor + interface
oficiais da Câmara e Senado        histórico                     (sem disco, sem estado)
```

- **Supabase** guarda o banco (é a única parte que precisa ser permanente).
- **GitHub Actions** faz a importação (o Render grátis dorme e apaga o disco, então não pode importar).
- **Render** só serve o app, lendo do Supabase.

### 1. Supabase (banco)
1. Crie uma conta em https://supabase.com e um **New project**. Anote a senha do banco.
   Região: escolha uma dos EUA (ex.: *East US / North Virginia*) e use **a mesma região no Render**, para o servidor e o banco ficarem perto.
2. No projeto, clique em **Connect** e copie a conexão **Session pooler** (porta 5432, endereço `…pooler.supabase.com`).
   Troque `[YOUR-PASSWORD]` pela sua senha. Se a senha tiver símbolos, use uma só com letras e números (ou codifique-os).
   > Use o **Session pooler**, não a "Direct connection": a direta só funciona em IPv6, e o Render e o GitHub usam IPv4.
3. As tabelas são criadas sozinhas na primeira conexão (com RLS ligado, então a API pública do Supabase não expõe nada).

### 2. GitHub (importação)
1. No repositório: **Settings → Secrets and variables → Actions → New repository secret**
   Nome: `DATABASE_URL` · Valor: a conexão do passo anterior.
2. (Opcional) Na aba **Variables**, crie `SYNC_FROM` com a data inicial do histórico (padrão `2023-02-01`).
3. **Primeira carga**: aba **Actions → Importar dados oficiais → Run workflow**. Dica: rode primeiro com `from` = `2025-01-01` (fica pronto mais rápido) e depois sem data, para trazer o resto.
   Cada rodada dura no máximo ~5h30 e continua de onde parou na próxima (a cada 6 h ela roda sozinha).
4. O repositório precisa ser **público** para o Actions ser ilimitado e grátis (em privado há uma cota mensal de minutos).

### 3. Render (site)
1. Em https://render.com: **New → Blueprint** → escolha este repositório. O arquivo `render.yaml` já configura tudo no plano grátis.
2. Quando pedir, cole a mesma `DATABASE_URL`. Clique em **Apply**.
3. Pronto: o endereço `https://….onrender.com` é o seu app. Acompanhe a importação em **Sobre os dados**.

### Como fica no plano grátis
- O Render grátis **dorme após 15 min sem acesso** e leva ~1 min para acordar. O app mostra "Acordando o servidor…" e repete sozinho; quem instalou no celular vê a tela na hora (a interface fica guardada no aparelho).
- O Supabase grátis tem **500 MB** e pausa projetos parados há 1 semana — a importação a cada 6 h mantém ele ativo. O tamanho do banco aparece em "Sobre os dados" e o Actions avisa quando passar de 85%.
- O GitHub desliga agendamentos após 60 dias sem atividade no repositório; o próprio workflow faz um commit vazio a cada ~45 dias para evitar isso.
- Se crescer, dá para migrar sem mudar o código: Render pago (sem dormir) e/ou Supabase Pro.

---

## Rodar no seu computador

Requisitos: **Node.js 22.13 ou mais novo**.

```bash
npm install
npm start          # http://localhost:3000
```

Sem `DATABASE_URL`, o app usa um **Postgres embutido** (PGlite) guardado em `data/pglite` — nada para instalar — e importa o histórico em segundo plano. Para usar o Supabase localmente, defina `DATABASE_URL`.

Importação manual: `npm run sync -- --from 2025-01-01` (aceita `--to`, `--casa camara|senado`, `--only votos,presenca,parlamentares`, `--max-minutes N`).

## Configuração (variáveis de ambiente)

| Variável | Padrão | O que faz |
|---|---|---|
| `DATABASE_URL` | — | Postgres (ex.: Supabase Session pooler). Sem ela, usa o PGlite local. |
| `DB_PATH` | `data/pglite` | Pasta do PGlite (modo local). |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | No Render, escuta em `0.0.0.0` automaticamente. |
| `SYNC_ON_START` | `1` local / `0` com DATABASE_URL | Importar dentro do servidor. |
| `SYNC_FROM` | `2023-02-01` | Data inicial do histórico. |
| `SYNC_INTERVAL_HOURS` | `6` | Intervalo da importação dentro do servidor (modo local). |
| `SYNC_CONCURRENCY` | `4` | Consultas simultâneas às fontes oficiais. |
| `SYNC_MAX_MINUTES` | — | Pausa a importação após N minutos (continua na próxima). |
| `PG_POOL_MAX` | `5` | Conexões simultâneas com o Postgres. |
| `DB_LIMIT_MB` | — | Limite do plano, para o aviso de espaço. |
| `RATE_LIMIT` | `300` | Consultas por minuto por IP. |
| `TRUST_PROXY` | — | `1` atrás de proxy/CDN (Render). |

## Desenvolvimento

```bash
npm run web:install && npm run web:build   # interface (React + TypeScript + Vite) → web/dist
npm run web:dev                            # interface em http://localhost:5173 (com `npm start` rodando)
npm test                                   # testes do servidor (PGlite); TEST_DATABASE_URL=postgres://… testa num Postgres real (use um banco vazio)
npm run check                              # servidor + build + testes da interface
```

- `server/` — importador (`sync.js`), API (`api.js`), servidor (`app.js`), banco (`db.js`).
- `web/` — interface React. `web/dist` já vem compilado.
- `server/test/` — testes de ponta a ponta contra uma **API oficial simulada** (`mock-upstream.js`).
- `.github/workflows/importar.yml` — importação agendada. `render.yaml` — blueprint do Render.

## Como os números são calculados

- **Participação em votações**: votos registrados (Sim/Não/Abstenção/Obstrução) ÷ votações nominais do Plenário entre a primeira e a última aparição do parlamentar nos dados.
- **Presença (Câmara)**: sessões deliberativas do Plenário com presença registrada ÷ total dessas sessões no mesmo intervalo. Não inclui comissões.
- **Presença (Senado)**: derivada das votações nominais ("Não compareceu" = falta).
- **Alinhamento ao partido**: voto igual à orientação oficial do partido; sem orientação, ao voto da maioria da bancada (mín. 3 votos Sim/Não, sem empate). Bancada liberada fica fora. Usa o partido da data da votação.
- **Leis**: projetos de autoria/coautoria com situação oficial "Transformado em Norma Jurídica", conferida projeto a projeto em segundo plano.

## Limites conhecidos

- Só votações do **Plenário**. Votações simbólicas/secretas não têm voto individual.
- **Pauta do Plenário do Senado** não está na fonte usada; o Senado mostra a agenda de comissões.
- Autoria de senadores usa um endpoint do Senado marcado como descontinuado e não informa quais viraram lei.

## O que foi validado

Testes automáticos contra uma API oficial simulada, rodando tanto no PGlite quanto num **Postgres 16 real** (driver `pg`): importação com paginação, nova tentativa após erro 503, idempotência, retomada, trava contra importação dupla, pausa por limite de tempo, cálculos, leis, pauta, cache com queda da fonte, segurança do servidor; e 17 fluxos de interface num navegador real (incluindo o servidor "dormindo").

**Ainda não validado de verdade:** Supabase, Render e GitHub Actions reais; as APIs oficiais reais (volume, tempo, limites, e se aceitam acessos vindos dos servidores do GitHub); o tamanho final do banco frente aos 500 MB.
