Pasta de músicas (ambient original)

Por direitos autorais, a OST oficial de outros jogos NÃO vem no pacote.

Há faixas ambient geradas (WAV) listadas em manifest.json.
Sem manifesto válido, o jogo usa a trilha procedural quieta.

O browser só libera áudio após um clique/toque (skin ou dificuldade).

Para trocar as faixas, coloque .mp3/.ogg/.wav AQUI e edite:

  music/manifest.json
  ["campo-branco.wav", "bafo-de-gelo.wav", "neblina-quieta.wav"]

Regenerar WAVs originais:
  node scripts/gen-ambient-music.mjs

A playlist é embaralhada a cada entrada no jogo.
