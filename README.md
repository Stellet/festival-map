# Festival Map

Protótipo mobile-first de mapa interativo para festivais, construído com HTML, CSS, JavaScript modular e SVG, sem frameworks ou bibliotecas externas.

## Como executar

Sirva a raiz do projeto por HTTP. O uso direto via `file://` não funciona porque as atrações são carregadas com `fetch()`.

Exemplos: VS Code Live Server ou qualquer servidor HTTP estático. Todos os caminhos são relativos e compatíveis com GitHub Pages.

## Estrutura

- `index.html`: interface, controles, painel de detalhes e editor debug.
- `data/attractions.json`: dados iniciais e posições das atrações.
- `assets/maps/festival-map.svg`: superfície SVG e estilos internos do mapa.
- `js/app.js`: inicialização e integração dos recursos.
- `js/map-controller.js`: enquadramento, zoom, drag e pinça.
- `js/navigation.js`: malha de circulação, grafo, pesos, Dijkstra e rota ativa.
- `js/attractions.js`: carregamento dos dados e categorias.
- `js/ui.js`: filtros e painel de detalhes.
- `css/`: tokens, layout e componentes responsivos.

## Recursos atuais

- Busca e filtros por categoria.
- Atrações renderizadas a partir do estado carregado do JSON.
- Painel de detalhes e botão “Como chegar”.
- Zoom por botões, roda do mouse e pinça.
- Arraste por mouse ou toque, com limites de pan.
- Enquadramento responsivo para desktop e celular.
- Grafo bidirecional com Dijkstra sobre uma malha vertical de percursos, corredores, rampas, escadas e acessos.
- Origem fictícia “Você está aqui”, selecionável entre nós do grafo.
- Modo debug ativável pelo botão ou por `?debug=true`.
- Criação visual por drag and drop, exclusão e posicionamento local de atrações.
- Visualização debug dos nós e conexões.
- Edição em memória de nós, conexões, tipos e pontos de controle da malha.

## Estado e persistência

O JSON é a fonte inicial. Edições feitas pelo debug existem somente em memória e são descartadas ao recarregar. Não há backend, `localStorage`, geolocalização real ou funcionamento offline.

O botão “Restaurar posições” restaura somente as coordenadas X/Y das atrações originais ainda presentes; ele não restaura integralmente edições ou exclusões.

## Limitações atuais

- A malha editada não é persistida e não permite criar ou excluir nós e conexões.
- Atrações criadas localmente precisam ser associadas manualmente a um nó para receber rota.
- O painel de detalhes usa categorias técnicas e metadados simplificados.
- Não há persistência, PWA ou planta real do evento.
