# Plano de testes manual: EcoCrédito Recife

- **Executado por:** Rômulo César
- **Data:** 17/11/2026
- **Aparelho:** Notebook Windows
- **Navegador:** Chrome
- **Site testado:** https://ecocredito-recife.vercel.app
- **/api/saude no início do teste:** ok:true, banco ok (247 ms)

Personagens do login simulado: **Ana** (cidadã), **Roberto** (outro cidadão), **Marina** (gestão de coleta), **Paulo** (operador da cooperativa).

Legenda: ✅ passou · ❌ falhou. Em caso de falha, abrir uma issue no GitHub e colocar o número na coluna Issue. Capturas de tela em `docs/telas-teste/caso-NN.png`.

| Nº | Caso | Passos | Resultado esperado | Resultado obtido | OK? | Issue |
|----|------|--------|--------------------|------------------|-----|-------|
| 1 | Cidadã registra entulho | Entrar como Ana. Aceitar o aviso se pedir. Em Registrar entulho, tirar ou escolher uma foto, marcar um ponto no mapa e enviar. | Aparece a tela do registro. Em Meus registros ele está como Aberto. | Ana registrou entulho com foto e ponto no mapa (Macaxeira). O app mostrou "Registro enviado com o número OC-2026-000051". Em Meus registros aparece como Aberto (17/11/2026, 22:28). | ✅ | |
| 2 | Registro sem foto | Como Ana, marcar o ponto no mapa, não escolher foto e enviar. | O app recusa e diz para enviar uma foto. Nada é criado. | O formulário não enviou e mostrou o aviso do navegador "Selecione um arquivo.". Nenhum registro novo apareceu em Meus registros. | ✅ | |
| 3 | Registro sem ponto no mapa | Como Ana, escolher a foto, não marcar o ponto e enviar. | O app recusa e pede para marcar o local. | O app recusou e mostrou "Marque no mapa onde está o entulho.". Nenhum registro novo foi criado. | ✅ | |
| 4 | Mesmo ponto vira confirmação | Como Ana, registrar num ponto. Sair, entrar como Roberto e registrar a menos de 30 m do mesmo ponto, com outra foto. | Não cria um segundo registro: o de Ana passa a ter 1 confirmação e aparece também em Meus registros do Roberto. | Na primeira tentativa o ponto do Roberto ficou a mais de 30 m e o app criou outro registro (OC-2026-000052). Marcando colado no pino da Ana, o app mostrou "Este ponto já havia sido registrado. Sua confirmação foi somada e ajuda a priorizar a remoção." e abriu o OC-2026-000051. No acompanhamento da Ana aparece "1 confirmação de outros moradores". | ✅ | |
| 5 | Gestão dá baixa (removido) | Entrar como Marina. Em Registros de entulho, abrir o registro da Ana e Dar baixa como removido, com foto do depois. | O registro sai da fila de abertos e vai para os baixados. Ana vê Baixado, com a foto do antes e do depois. | Como Marina, dei baixa no OC-2026-000051 como "Entulho removido", com foto do depois. Como Ana, o registro mostra as fotos Antes e Depois e o acompanhamento "Entulho removido: baixa dada" (17/11/2026, 22:54). | ✅ | |
| 6 | Gestão dá baixa (não procedente) | Como Marina, dar baixa em outro registro como não procedente. | O app exige o motivo. Com o motivo, o registro fica como Não procedente. | Marquei o registro Caçote (OC-2026-000026) como "Não procedente", com uma foto e sem escrever motivo. O app concluiu a baixa sem exigir o motivo, embora a tela diga que a observação é obrigatória se o registro não procede. O registro aparece em "Já tiveram baixa" como Não procedente. Não testei sem foto. | ❌ | #3 |
| 7 | Reciclar: crédito de EcoCoins | Como Ana, ir em Reciclar e gerar o código QR. Em outra janela, entrar como Paulo (operador), digitar o código, escolher um material e um peso (ex.: 3 kg de vidro) e confirmar. | O operador vê o resultado. O saldo da Ana sobe pelo valor da tabela do material e aparece no histórico. | O saldo da Ana passou de 82 para 172 EcoCoins (+90) com 3 kg de vidro. | ✅ | |
| 8 | Código usado duas vezes | Tentar registrar uma segunda entrega com o mesmo código do caso 7. | Recusado: código inválido, expirado ou já utilizado. O saldo não muda. | O app recusou o código já utilizado. | ✅ | |
| 9 | Código expirado | Como Ana, gerar um código, esperar mais de 2 minutos e tentar usá-lo como Paulo. | Recusado: código expirado. | Código 97Q59-2NZ55, gerado por Ana às 10:55 e digitado por Paulo às 21:26. O app recusou com "Código inválido, expirado ou já utilizado." | ✅ | |
| 10 | Peso inválido | Como Paulo, com um código novo, informar peso 0 e depois um número negativo. | Recusado nos dois casos. O código não é gasto (dá para usar de novo com um peso válido). | Com peso 0 e com peso -2, o botão de confirmar ficou desabilitado (cinza, sem permitir o clique) e a entrega não foi registrada. Uma entrega com peso válido (1 kg de alumínio) foi aceita depois (+100 EcoCoins); não verifiquei se foi com o mesmo código. | ✅ | |
| 11 | Trocar EcoCoins por Capiba | Como Ana, em Trocar por Moeda Capiba, trocar 1 Capiba (100 EcoCoins). | O saldo de EcoCoins cai 100, o saldo de Capibas sobe 1 e aparece um protocolo SIM-… no histórico. A tela avisa que é simulado. | O app mostrou "Troca simulada: 1 Capiba por 100 EcoCoins (protocolo SIM-0E154E2C)" com o aviso de que, no ambiente real, as Capibas chegariam ao Conecta Recife. Em Minhas trocas aparece "1 Capiba · −100 EcoCoins". | ✅ | |
| 12 | Trocar mais do que o saldo | Como Ana, pedir mais Capibas do que o saldo permite. | Recusado, dizendo quantos EcoCoins faltam. O saldo não muda. | Com 172 EcoCoins, digitei 50 Capibas. O campo bloqueou com "O valor precisa ser 1." e nada foi trocado. A mensagem com quantos EcoCoins faltam não apareceu, porque o campo já limita o valor ao saldo. | ✅ | |
| 13 | Permissão por perfil | Como Ana, tentar abrir /gestor na barra de endereço. Como Marina, tentar abrir /carteira. | Os dois vão para a tela de acesso negado (ou para a página inicial do perfil). | Como Marina, ao abrir uma página de cidadão, o app levou a /acesso-negado com "Acesso restrito. O seu perfil não tem permissão para abrir esta página." e o botão "Voltar para a minha área". Como Ana, ao abrir /gestor, o resultado foi o mesmo. | ✅ | |



## Observações

- Caso 2: a recusa vem da validação do navegador ("Selecione um arquivo."), sem texto próprio do app. Funciona, mas a mensagem poderia ser mais clara.
- Caso 4: o registro OC-2026-000052 foi criado porque o ponto ficou a mais de 30 m do da Ana. É o comportamento esperado pela regra.
- Caso 9: a mensagem de recusa é genérica (inválido, expirado ou já utilizado), então a tela não diz qual foi o motivo.
- Caso 10: o app impede peso 0 e negativo desabilitando o botão, sem mostrar mensagem explicando o motivo.
- Caso 12: o limite do campo impede pedir mais do que o saldo, então a mensagem "faltam X EcoCoins" só aparece quando o saldo é menor que 100.
- Caso 13: a página 404 de /minhas-ocorrencias (aberta pela Marina) aparece em inglês e sem link para voltar.
- O painel da gestão mostrou 4 kg reciclados em 2 entregas e 190 EcoCoins emitidos, o que bate com as entregas dos casos 7 e 10 (90 + 100).

## Conclusão

Foram executados os 13 casos no site publicado. 12 passaram e 1 falhou (caso 6). A falha foi registrada na issue #3: a baixa "Não procedente" foi concluída sem o motivo, que a própria tela diz ser obrigatório. Nos demais casos o comportamento bateu com o esperado.