# Radar Legislativo

App para acompanhar o Congresso Nacional: **pauta por dia**, **histórico de votações com o voto de cada parlamentar**, e **perfil de cada deputado/senador** (como votou, projetos apresentados, leis, presença). Dados abertos oficiais da Câmara e do Senado. Funciona no navegador e pode ser instalado no celular (PWA).

## Como rodar

Requisitos: **Node.js 22.13 ou mais novo** (https://nodejs.org). Não precisa instalar nenhuma dependência para rodar.

```bash
npm start
# abra http://localhost:3000
```

Na primeira execução o app **importa o histórico em segundo plano** (por padrão desde fev/2023, início da legislatura atual) e repete a cada 6 horas. Acompanhe em "Sobre os dados". Você pode usar o app enquanto importa; os dados vão aparecendo.

- A primeira importação faz muitas consultas às APIs oficiais (dezenas de milhares) e pode levar de dezenas de minutos a algumas horas, conforme a rede e a velocidade da fonte. Ela é **retomável**: se parar, na próxima vez continua de onde estava.
- Para começar mais rápido, importe só um período recente: `npm run sync -- --from 2025-01-01`.
- Importação manual: `npm run sync -- --from 2024-01-01 --to 2024-12-31 --casa camara --only votos,presenca,parlamentares`.

## Configuração (variáveis de ambiente)

| Variável | Padrão | O que faz |
|---|---|---|
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Porta e endereço. Use `HOST=0.0.0.0` para acessar de outros aparelhos/servidor. |
| `DB_PATH` | `data/radar.sqlite` | Arquivo do banco (SQLite). |
| `SYNC_FROM` | `2023-02-01` | Data inicial do histórico. |
| `SYNC_INTERVAL_HOURS` | `6` | Intervalo da atualização automática. |
| `SYNC_ON_START` | `1` | `0` desliga a importação automática (use `npm run sync` manualmente). |
| `SYNC_CONCURRENCY` | `4` | Consultas simultâneas à fonte (não aumente muito: há limite de uso). |
| `RATE_LIMIT` | `300` | Máximo de consultas por minuto por IP. |
| `TRUST_PROXY` | — | `1` quando estiver atrás de proxy/CDN (usa `X-Forwarded-For` para o limite por IP). |

## Publicar de verdade (para virar app)

- É **um único processo Node + um arquivo SQLite**. Qualquer VPS/PaaS com disco persistente serve (Fly.io, Railway, Render, VPS). Monte um volume para `DB_PATH`.
- Coloque atrás de HTTPS (necessário para instalar como PWA no celular). O servidor já envia cabeçalhos de segurança, compressão e cache.
- Há um `Dockerfile` (não foi testado neste ambiente): `docker build -t radar . && docker run -p 3000:3000 -v radar-data:/data radar`.
- Para empacotar em loja (Android/iOS), o caminho mais simples é envolver a URL publicada em um shell (Capacitor ou TWA); o app já é responsivo e tem manifesto e ícones.

## Desenvolvimento

```bash
npm run web:install      # instala a interface (React + TypeScript + Vite)
npm run web:dev          # interface em http://localhost:5173 (precisa do `npm start` rodando)
npm run web:build        # gera web/dist, servido pelo Node
npm run check            # testes do servidor + build + testes da interface
```

- `server/` — importador (`sync.js`), API (`api.js`), servidor (`app.js`), banco (`db.js`).
- `web/` — interface React.
- `server/test/` — testes de ponta a ponta contra uma **API oficial simulada** (`mock-upstream.js`).

## Como os números são calculados

- **Participação em votações**: votos registrados (Sim/Não/Abstenção/Obstrução) ÷ votações nominais do Plenário entre a primeira e a última aparição do parlamentar nos dados (recortada pelo período escolhido).
- **Presença (Câmara)**: sessões deliberativas do Plenário com presença registrada ÷ total dessas sessões no mesmo intervalo. Não inclui comissões.
- **Presença (Senado)**: derivada das votações nominais (“Não compareceu” = falta).
- **Alinhamento ao partido**: votos iguais à orientação oficial do partido; sem orientação, ao voto da maioria da bancada (mín. 3 votos Sim/Não, sem empate). Bancada liberada fica fora. Usa o partido da data da votação.
- **Leis**: projetos de autoria/coautoria com situação oficial “Transformado em Norma Jurídica”, conferida projeto a projeto em segundo plano (a primeira visita a um perfil pode demorar alguns instantes).

## Limites conhecidos

- Só votações do **Plenário** (não comissões). Votações simbólicas/secretas não têm voto individual.
- **Pauta do Plenário do Senado** não está na fonte usada; o Senado mostra a agenda de comissões.
- Autoria de senadores usa um endpoint do Senado marcado como descontinuado e não informa quais viraram lei.
- Dados dependem da publicação oficial (atrasos e correções acontecem).
- Foi desenvolvido sem acesso às APIs reais no ambiente de construção; veja "O que foi validado" abaixo.

## O que foi validado

Validado automaticamente (API oficial simulada, com os formatos de resposta conferidos na documentação): importação com paginação (>100 votos), nova tentativa após erro 503, idempotência, retomada, cálculos de participação/presença/alinhamento, leis, pauta, cache em caso de queda da fonte, segurança do servidor estático, e 15 fluxos de interface em navegador real (celular).

**Ainda não validado com os dados reais:** o comportamento do importador contra os servidores oficiais (tempo total, limites de requisição) e se o endpoint de presença dos eventos da Câmara representa fielmente a presença registrada. Faça uma primeira importação curta (`--from` recente) e confira alguns deputados com o site oficial antes de divulgar.
