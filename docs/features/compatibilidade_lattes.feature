# docs/features/compatibilidade_lattes.feature
Feature: Recomendação de editais por compatibilidade com Currículo Lattes
  Como pesquisador, docente ou estudante
  Quero comparar meu Currículo Lattes (XML) ou minhas áreas de interesse com os editais abertos
  Para encontrar oportunidades compatíveis com total privacidade (100% no navegador / LGPD)

  Background:
    Given que acesso a rota "/compatibilidade/" do portal de editais

  Scenario: Visualizar aviso de privacidade LGPD e opções de comparação
    When a página for carregada
    Then devo ver o aviso garantindo que o XML nunca sai do navegador
    And devo ver as opções de upload do XML do Lattes e modo rápido manual

  Scenario: Comparar perfil pelo modo rápido manual
    When seleciono titulação "Doutorado" e informo áreas "inteligência artificial, saúde"
    And aciono "Encontrar editais compatíveis"
    Then o portal exibe apenas editais abertos/fechando com compatibilidade superior a 0%
    And cada resultado mostra a pontuação percentual e os motivos do match

  Scenario: Processar XML oficial do Lattes localmente sem expor dados pessoais
    When envio um arquivo XML válido exportado do Currículo Lattes
    Then o portal extrai titulação, áreas de atuação e palavras-chave localmente no navegador
    And não exibe nem envia dados pessoais como nome completo, CPF ou e-mail
