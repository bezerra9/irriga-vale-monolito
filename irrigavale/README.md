# IrrigaVale

**Monitoramento e alerta de irrigação para pequenos e médios produtores do Vale do São Francisco.**

O IrrigaVale junta sensores de umidade do solo instalados no campo e um app Android para ajudar o produtor a irrigar na hora certa e com a quantidade certa de água. Assim ele evita desperdício e protege a lavoura do estresse hídrico.

## O problema

No semiárido, a água é o recurso mais caro e mais escasso da produção. É comum irrigar sempre o mesmo volume, no mesmo horário, sem saber se o solo realmente precisa. Isso gasta água e energia e nem sempre atende a necessidade da planta.

## O que o IrrigaVale faz

- **Monitora o solo em tempo real:** sensores em cada zona da fazenda enviam umidade, temperatura e nível de bateria em intervalos configuráveis.
- **Recomenda quando irrigar:** cada zona tem seus próprios limiares e fase de manejo. Quando o solo fica seco, o sistema gera uma recomendação e alerta o produtor.
- **Envia alertas inteligentes:** avisa por SMS sobre solo seco e sensores offline, com controle anti-spam e horário de silêncio no fuso da fazenda.
- **Controla a irrigação pelo app:** o produtor aprova, inicia e encerra cada irrigação e registra o volume usado.
- **Executa rotinas programadas:** irrigações agendadas que são puladas automaticamente quando o solo já está úmido.
- **Mostra o clima no painel:** condições atuais da cidade da fazenda.
- **Calcula a economia:** compara o consumo com o método manual, em litros e em reais.

## Como funciona

```
Sensor no campo ──▶ API IrrigaVale ──▶ Banco de dados
                         │
                         ├─ regras de irrigação
                         ├─ rotinas e alertas
                         ▼
                    App Android do produtor
```

## Tecnologias

| Camada | Stack |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy 2 (async), Alembic |
| Banco de dados | PostgreSQL |
| App | React Native (Expo) com TypeScript |
| Sensores | ESP32 / Arduino |
| Integrações | Open-Meteo (clima) e SMS |

## Estrutura do repositório

- `backend/`: API e regras de negócio
- `mobile/`: app Android

## Status

Projeto em desenvolvimento. Hoje o produtor inicia e encerra cada irrigação pelo app, e o sistema registra o que foi feito. Ligar e desligar a bomba d'água automaticamente, pelo próprio dispositivo no campo, está nos próximos passos.
