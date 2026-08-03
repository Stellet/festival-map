# Festival Map

Protótipo mobile-first de mapa interativo para festivais, construído com HTML, CSS, JavaScript modular e SVG, sem frameworks ou bibliotecas externas.

## Como executar

Sirva a raiz do projeto por HTTP. O uso direto via `file://` não funciona porque os pontos de interesse são carregados com `fetch()`.

Exemplos: VS Code Live Server ou qualquer servidor HTTP estático. Todos os caminhos são relativos e compatíveis com GitHub Pages.

## Estrutura

- `index.html`: interface, controles, painel de detalhes e editor debug.
- `data/attractions.json`: dados iniciais e posições dos pontos de interesse.
- `data/areas.json`: sete áreas principais, limites, acessos e capacidades futuras.
- `assets/maps/festival-map.svg`: superfície SVG e estilos internos do mapa.
- `js/app.js`: inicialização e integração dos recursos.
- `js/map-controller.js`: enquadramento, zoom, drag e pinça.
- `js/navigation.js`: malha de circulação, grafo, pesos, Dijkstra e rota ativa.
- `js/areas.js`: carregamento, contenção e sincronização das sete áreas.
- `js/attractions.js`: carregamento dos dados e categorias.
- `js/ui.js`: filtros e painel de detalhes.
- `css/`: tokens, layout e componentes responsivos.
- `HISTORY.md`: registro das migrações estruturais do protótipo.

## Recursos atuais

- Busca e filtros por categoria.
- Pontos de interesse tipados e renderizados a partir do estado carregado do JSON.
- Pontos vinculados obrigatoriamente a áreas editáveis, com contenção e posição relativa preservada.
- Filtros gerados dinamicamente apenas para tipos presentes no estado.
- Painel de detalhes e botão “Como chegar”.
- Resumo com descrição em duas linhas e camada “Mais detalhes” com dados completos e links externos.
- Zoom por botões, roda do mouse e pinça.
- Arraste por mouse ou toque, com limites de pan.
- Enquadramento responsivo para desktop e celular.
- Grafo bidirecional com Dijkstra sobre uma malha vertical de percursos, corredores, rampas, escadas e acessos.
- Origem fictícia “Você está aqui”, selecionável entre nós do grafo.
- Marcador “Você está aqui” arrastável também no modo normal, com posição persistida localmente.
- Modo debug ativável pelo botão ou por `?debug=true`.
- Criação visual por drag and drop, exclusão e posicionamento local de pontos de interesse.
- Edição em memória de descrições, categorias, horários, localização complementar e links de pontos e áreas.
- Visualização debug dos nós e conexões.
- Edição em memória de nós, conexões, tipos e pontos de controle da malha.
- Camada opcional de planta baixa ajustável no debug, sem imagem incluída no projeto.

## Estado e persistência

O JSON é a fonte inicial. Edições feitas pelo debug existem somente em memória e são descartadas ao recarregar. Apenas a posição de “Você está aqui” usa `localStorage`; não há backend, geolocalização real ou funcionamento offline.

Os dados originais dos pontos de interesse são restaurados somente ao recarregar a página; edições e exclusões não são persistidas.

## Limitações atuais

- A malha editada não é persistida e não permite criar ou excluir nós e conexões.
- Pontos criados localmente precisam ser associados manualmente a um nó para receber rota.
- O painel de detalhes usa categorias técnicas e metadados simplificados.
- Não há persistência, PWA ou planta real do evento.
