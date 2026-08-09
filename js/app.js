    "use strict";

    document.addEventListener("DOMContentLoaded", async () => {
      inicializarExperienciaSprint042();
      const temaSalvo = (() => {
        try {
          return localStorage.getItem(TEMA_STORAGE_KEY) || "azul";
        } catch {
          return "azul";
        }
      })();

      await aplicarTema(temaSalvo);
      bindAuthEvents();
      bindOnboardingEvents();
      vincularFinancasUI();

      if (detectarTokenResetSenha()) {
        showAuthScreen("reset");
        return;
      }

      const autenticado = await validarSessaoAtual();
      if (!autenticado) {
        showAuthScreen("login");
        return;
      }

      showAppShell();
      mostrarSplashDiaria();
      await garantirAppAutenticadoInicializado();
      await carregarStatusDemo({ mostrarBoasVindas: true });
    });
