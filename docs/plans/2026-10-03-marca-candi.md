# Marca Candi (2026-10-03)

Pedido do usuário: a marca "Caçavaga" ("central de vagas") vira **Candi**, subtítulo **"central do candidato"**,
com a logo nova (mockup raster enviado pelo usuário: quadrado escuro com borda verde, "C" limão, check na abertura
e um ponto à direita). Histórico: Estágios → Jobusque → Caçavaga (2026-10-02) → Candi.

- [x] texto: sidebar (desktop e mobile), `<title>`/metadata, login, README, CLAUDE.md
- [x] logo recriada em SVG (`components/brand/candi-logo.tsx`) com os tokens do tema
      (`sidebar-primary-foreground` no fundo, `st-open` no C, check e ponto); substitui o Crosshair da marca
      (o Crosshair do "Buscar vaga específica" em `ops.tsx` fica)
- [x] favicons: `public/icon.svg` com a mesma geometria (cores fixas do tema escuro); `icon-light-32x32.png`,
      `icon-dark-32x32.png` e `apple-icon.png` (180x180) gerados dele com Inkscape (a logo é a mesma nos dois temas)
- Não mudam: chaves `estagios:`, nome do pacote, pastas, repo. Pingo verde do "i" no wordmark ficou de fora
  (exigiria desenhar o glifo; o texto segue "Candi" puro).
