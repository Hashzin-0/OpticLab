# Catálogo cinematográfico do OpticLab

**Versão do catálogo:** 2.0.0  
**Natureza:** estudos técnicos autorais, não LUTs oficiais nem reprodução de fotogramas.

## Objetivo

O catálogo traduz vocabulário de cinematografia em referências estruturadas que ajudam o Gemini a interpretar a cena e propor correções compatíveis com a fotografia. Não é um seletor de filtros: os registros descrevem contexto, iluminação, paleta, atmosfera, linguagem de câmera, obras de referência e limites de implementação.

## Escopo desta versão

A biblioteca contém mais de 50 estudos organizados em famílias como:

- Luz natural: golden hour, blue hour, céu nublado, janela, contraluz, amanhecer e luz difusa.
- Noite e baixa luz: noir, neon, chuva urbana, vapor de sódio, tungstênio, velas e luz fluorescente.
- Paisagem e natureza: deserto, floresta, tropical, costa, ártico, aéreo, astrofotografia e paisagem épica.
- Retrato e moda: editorial natural, beauty high-key, chiaroscuro, flash direto, glamour clássico e luxo discreto.
- Narrativa e gênero: thriller psicológico, western, drama de época, fantasia, guerra, ação e neo-noir.
- Usos específicos: gastronomia, automotivo, arquitetura, esportes, palco, casamento e viagem.
- Referências fotoquímicas: negativo colorido, contraste de cópia, 16 mm, anos 1970 e bleach-bypass como estudo tonal.

Cada registro contém:
- ID estável e nome legível.
- Intenção fotográfica e termos de busca em português/inglês.
- Contextos de cena, caráter da luz, família de paleta e clima emocional.
- Linguagem de câmera/composição como metadado descritivo.
- Obras e anos usados como referência contextual, com uma nota do aspecto estudado.
- Viés global conservador, limitado ao schema matemático já suportado.
- Cuidados para evitar alterações inadequadas.
- Nota explícita sobre o que o renderizador atual consegue ou não implementar.

## Como o catálogo participa do fluxo

1. A instrução do usuário e o contexto disponível são usados para recuperar candidatos por busca lexical híbrida e aliases em português/inglês.
2. Os metadados recuperados são enviados ao Gemini junto com a imagem original.
3. O Gemini avalia se os candidatos combinam com a cena, a iluminação e a intenção do usuário. A referência é orientação, não uma ordem para aplicar um preset.
4. O modelo produz o plano numérico completo dentro do schema existente.
5. O servidor valida o plano e o renderizador determinístico aplica somente operações permitidas.
6. Refinamentos continuam partindo do original, preservando reversibilidade.

A recuperação atual é lexical determinística, não embedding/vector search. Ela usa nome, intenção, palavras-chave, contexto, iluminação, paleta, humor, linguagem de câmera e títulos de referência. Não deve ser descrita como busca semântica vetorial.

## Limites técnicos importantes

O catálogo é mais amplo do que o renderizador. Um registro pode descrever:
- grão fotoquímico;
- halation/bloom;
- resposta espectral de emulsão;
- curva de negativo e cópia;
- aberração, flare, vinheta e comportamento de lente;
- profundidade de campo e perspectiva;
- névoa, chuva, reflexos ou luz volumétrica.

Essas características são **metadados de referência**, não efeitos implementados. O renderer atual só aceita os parâmetros definidos em `AdjustmentSchema`: exposição, contraste, saturação, warmth, highlights, shadows e blur regional aproximado. Não se deve simular uma capacidade inexistente nem aplicar blur para fingir profundidade óptica.

Os valores `globalBias` são pontos de partida autorais e conservadores, não medições de LUTs ou de cenas reais. O Gemini deve adaptar ou rejeitar esses vieses com base na imagem e no pedido.

## Obras de referência

Os títulos e anos são referências culturais para comunicar linguagem visual, não fontes de fotogramas. Entre as obras citadas estão:

- *The Batman* (2022), *Blade Runner 2049* (2017), *Dune* (2021), *The Revenant* (2015), *Sicario* (2015), *Skyfall* (2012).
- *In the Mood for Love* (2000), *Chungking Express* (1994), *Fallen Angels* (1995), *Moonlight* (2016), *Aftersun* (2022).
- *The Grand Budapest Hotel* (2014), *Carol* (2015), *Barry Lyndon* (1975), *The Godfather* (1972), *The Lighthouse* (2019).
- *City of God* (2002), *Central Station* (1998), *Roma* (2018), *The Florida Project* (2017), *Perfect Days* (2023).

Créditos técnicos específicos só devem ser adicionados após conferência em fontes primárias, como American Cinematographer/ASC, BSC, créditos oficiais ou entrevistas com a equipe. O catálogo atual não inventa nomes de diretores de fotografia.

## Direitos autorais e proveniência

- Não baixar, incorporar ou redistribuir stills protegidos sem licença ou base legal adequada.
- Não copiar LUTs comerciais, grades proprietários ou tabelas técnicas não licenciadas.
- Títulos de filmes podem ser citados como referências textuais; isso não concede direito de reproduzir sua imagem.
- Preferir descrições técnicas autorais, dados de fabricante publicados, material em domínio público e imagens licenciadas.
- Para futura inclusão de imagens, registrar URL de origem, titular, licença, atribuição, restrições, data de verificação e responsável pela revisão.
- Não usar screenshots de ShotDeck, Shot.Café ou outros bancos como dataset sem autorização explícita de seus termos.

## Fontes técnicas consultadas

- Kodak Motion Picture Camera Films: https://www.kodak.com/en/motion/products/camera-films/
- Kodak VISION3 50D Technical Data: https://www.kodak.com/content/products-brochures/Film/VISION3_50D_5203_TI-2657_Technical-Data_EN.pdf
- American Cinematographer — The Batman / Greig Fraser: https://theasc.com/article/greig-fraser-batman/
- American Cinematographer — Clubhouse Conversations: The Batman: https://theasc.com/video/clubhouse-conversations-the-batman/
- Kodak Essential Reference Guide for Filmmakers: https://cinematographersportal.com/wp-content/uploads/2016/11/kodak_essential_reference_guide.pdf
- Shot.Café (pesquisa visual; respeitar termos de uso): https://shot.cafe/
- ShotDeck (pesquisa visual; respeitar licença e termos): https://shotdeck.com/
- FrameThrower (metadados e taxonomia visual; respeitar termos): https://framethrower.ai/reference

As fontes acima orientam a taxonomia e os limites técnicos. Não significam que os valores numéricos do catálogo tenham sido medidos diretamente nos filmes citados.

## Próximas evoluções recomendadas

1. Avaliação visual com conjunto de fotografias de teste e rótulos revisados por colorista.
2. Embeddings e busca vetorial com proveniência, versão e score auditável.
3. Catálogo de referências com licenças explícitas e dados de cor medidos.
4. Pipeline linear-light com gerenciamento de cor e transformações de display documentadas.
5. Módulos separados e testados para grão, halation, curvas de filme, sharpening e denoise.
6. QA automatizado de preservação de identidade, clipping, artefatos e regiões alteradas.
