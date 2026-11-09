# Configuração segura de provedores

## Chave de criptografia

O servidor criptografa API keys de IA e tokens de pagamento com AES-256-GCM antes de gravá-los em `system_settings`. Gere uma chave mestra exclusiva de 32 bytes, codificada em Base64:

```sh
openssl rand -base64 32
```

Cadastre o resultado como variável **secreta de servidor** `AI_SECRETS_ENCRYPTION_KEY` no projeto Vercel e faça um novo deploy. Não use prefixo `NEXT_PUBLIC_`, não compartilhe a chave e guarde uma cópia offline segura. A perda desta chave torna os segredos salvos irrecuperáveis; a rotação requer recriptografar todos os valores antes de substituir a chave.

## Provedores de IA

Entre como administrador, abra `/admin/ai`, escolha um provedor, informe sua API key e modelo, teste a conexão e salve. É necessário que o servidor tenha saída de rede permitida para o endpoint do provedor escolhido. O agente autenticado usa o provedor configurado. O teste faz uma chamada real e pode consumir créditos do provedor.

## Pagamentos

Em `/admin/billing`, o token Mercado Pago é guardado criptografado e pode ser validado contra a API de identidade do Mercado Pago. Isso **não** ativa checkout, assinatura ou webhook. Não habilite cobrança real até que a integração de checkout, verificação de assinatura dos webhooks, idempotência, notificações e reconciliação sejam implementadas e validadas ponta a ponta.

## Fotos de perfil

A foto é enviada diretamente pelo navegador ao bucket privado `motion-media`, na pasta `<auth-user-uuid>/profile/`. A URL assinada é curta e o caminho do objeto (não URL pública) fica no perfil. Tipos aceitos: JPEG, PNG e WebP, com limite de 5 MB.

## Limites deste commit

A configuração não cria credenciais. As credenciais dos provedores devem ser obtidas pelo responsável da conta. A troca de email depende do fluxo de confirmação configurado no Supabase Auth. Configuração visual ou testes de conexão não substituem teste de produção, revisão de segurança nem validação de cobrança.
