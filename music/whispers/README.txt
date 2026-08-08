Sussurros místicos ("Bebe, bebe" — português do Brasil)

Quatro WAVs filtrados tocam ao acaso durante a partida.
Lista: manifest.json

Para trocar pelas suas gravações:
1. Coloque 4 arquivos .wav (ou .mp3/.ogg) nesta pasta
2. Edite manifest.json com os nomes
3. Opcional — limpar ruído com ffmpeg:
   ffmpeg -i sujo.wav -af "highpass=f=180,lowpass=f=4200,afftdn=nf=-22,aecho=0.7:0.55:60|140:0.35|0.25,loudnorm=I=-22:TP=-2" limpo.wav

Regenerar os clips sintéticos atuais:
  python3 scripts/gen-bebe-whispers.py
