# Festival Map

Protótipo mobile-first de um mapa interativo para festivais, construído com HTML, CSS, JavaScript e SVG.

## Como executar

O projeto precisa ser servido por HTTP porque as atrações são carregadas de um arquivo JSON.

### VS Code + Live Server

1. Abra a pasta `festival-map` no VS Code.
2. Instale a extensão **Live Server**.
3. Clique com o botão direito em `index.html`.
4. Selecione **Open with Live Server**.

## Recursos atuais

- Mapa fictício desenhado em SVG por código.
- Áreas coloridas e marcadores interativos.
- Busca por atrações e serviços.
- Filtros por categoria.
- Zoom, arraste e restauração da visualização.
- Painel de detalhes.
- Rota visual simples a partir do ponto “Você está aqui”.
- Interface adaptada para celular e desktop.

## Limitações atuais

- A rota ainda é uma linha demonstrativa, não um cálculo real sobre caminhos.
- O ponto inicial é fixo.
- O zoom por gesto de pinça ainda não foi implementado.
- O mapa ainda não usa geolocalização nem planta real.

## Próximos passos

- Criar uma malha de nós e conexões para rotas reais.
- Implementar zoom por pinça com dois dedos.
- Adicionar múltiplos pontos “Você está aqui”.
- Criar editor interno de atrações e posições.
- Preparar funcionamento offline como PWA.
