      const debugPermitido =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      if (debugPermitido && window.location.search.includes('debug')) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/eruda';
        document.head.appendChild(script);
        script.onload = () => eruda.init();
      }
