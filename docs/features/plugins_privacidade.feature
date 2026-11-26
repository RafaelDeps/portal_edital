# docs/features/plugins_privacidade.feature
Feature: Plugins de acessibilidade e análise com consentimento LGPD
  Como visitante ou mantenedor do Portal de Editais
  Quero contar com UserWay para acessibilidade e com Microsoft Clarity e Google Analytics respeitando consentimento de cookies
  Para melhorar a inclusão e o acompanhamento de uso sem violar a privacidade dos visitantes

  Scenario: UserWay carrega em português sem sobrepor o menu nativo quando configurado
    Given que PUBLIC_USERWAY_ACCOUNT_ID está configurado no ambiente
    When acesso qualquer página do portal
    Then o script do UserWay é injetado em português no canto inferior esquerdo
    And o menu de acessibilidade nativo permanece visível e funcional no canto inferior direito

  Scenario: Clarity e Google Analytics exigem consentimento explícito antes de carregar
    Given que PUBLIC_CLARITY_PROJECT_ID ou PUBLIC_GA_MEASUREMENT_ID estão configurados
    When acesso o portal pela primeira vez sem preferência salva
    Then devo ver o banner de consentimento de cookies com as opções "Aceitar" e "Recusar"
    And nenhum script do Clarity ou Google Analytics deve ser carregado antes do clique em "Aceitar"

  Scenario: Visitante pode reabrir e alterar a preferência de cookies pelo rodapé
    Given que já cliquei em "Aceitar" ou "Recusar" no banner de cookies
    When clico no botão "Preferências de cookies" no rodapé
    Then o banner de consentimento é exibido novamente para permitir alterar minha decisão

  Scenario: Nenhum plugin externo ou banner é exibido quando variáveis não estão configuradas
    Given que nenhuma variável PUBLIC_* dos plugins está configurada
    When o portal é gerado e acessado
    Then nenhum script do UserWay, Clarity ou Google Analytics é injetado
    And nem o banner nem o botão de preferências de cookies são exibidos
