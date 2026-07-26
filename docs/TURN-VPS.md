# TURN próprio (VPS)

O co-op **2 jogadores** tenta WebRTC P2P. Se NAT/firewall bloquear, cai no relay HTTPS da HostGator.  
Um **TURN** na sua VPS melhora o P2P (não substitui o relay para 3–4 jogadores).

## Coturn (resumo)

1. Instale `coturn` na VPS  
2. Abra firewall: UDP/TCP **3478**, TLS **443** ou **5349**, faixa UDP de relay  
3. Exemplo mínimo `turnserver.conf`:

```
listening-port=3478
tls-listening-port=443
fingerprint
lt-cred-mech
realm=neve.example
user=neve:SENHA_FORTE
external-ip=IP_PUBLICO
```

4. Prefira `turns:` na 443 em redes restritivas.

## Ligar no jogo

No `index.html` **da HostGator** (não commite a senha no Git), **antes** do `bundle.js`:

```html
<script>
  window.NEVE_TURN = {
    urls: "turns:turn.seu-dominio.com:443",
    username: "neve",
    credential: "SENHA_FORTE"
  };
</script>
```

Ou lista completa:

```html
<script>
  window.NEVE_ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turns:turn.seu-dominio.com:443",
      username: "neve",
      credential: "SENHA_FORTE"
    }
  ];
</script>
```

Implementação: `src/js/net/iceConfig.js`.

## Checklist

- [ ] Coturn rodando e acessível do celular 4G  
- [ ] Credenciais só no servidor de produção  
- [ ] Teste 2P: status “P2P direto” (não só relay)  
- [ ] 3–4P continua em relay HTTPS (esperado)

Ver também `docs/COOP.md`.
