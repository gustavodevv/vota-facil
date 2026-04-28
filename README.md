# Vota Fácil — versão estática sem Base44

Este projeto foi refeito para rodar direto no VS Code com a extensão **Live Server**, sem SDK, plugin, autenticação ou backend do Base44.

## Como rodar

1. Abra esta pasta no VS Code.
2. Instale a extensão **Live Server**, se ainda não tiver.
3. Clique com o botão direito em `index.html`.
4. Escolha **Open with Live Server**.

Rotas disponíveis:

- `#/Vote` — página pública de votação.
- `#/AdminPoll` — painel para criar, editar e acompanhar enquetes.

## O que mudou

- Removido todo uso de `@base44/sdk`, `@base44/vite-plugin`, autenticação e entidades remotas.
- Refeito em HTML, CSS e JavaScript puro.
- Sem `npm install`, sem Vite e sem etapa de build.
- Dados persistidos em `localStorage` do navegador.
- Suporte a criar, editar, ocultar, publicar, encerrar, zerar votos, exportar JSON e importar JSON.
- Rotas por hash para funcionar bem com Live Server.

## Observação importante

Por ser uma versão totalmente estática, os votos ficam salvos apenas no navegador/dispositivo em que a página foi aberta. Para uma votação pública real entre vários usuários, será necessário conectar um backend como Firebase, Supabase, uma API própria ou outro banco online.

## Estrutura

```txt
index.html
styles.css
app.js
README.md
```

## Backup dos dados

No painel Admin, use **Exportar JSON** para baixar uma cópia das enquetes/votos e **Importar JSON** para restaurar em outro navegador.
