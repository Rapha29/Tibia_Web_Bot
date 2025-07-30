// ecosystem.config.js
module.exports = {
  apps : [{
    name   : "bkhealth",
    script : "run.py",                         // MUDANÇA: Executa o script Python
    interpreter: "/home/clinica/env/bin/python", // Usa o Python do seu ambiente virtual
    cwd    : "/home/clinica/",                 // Define o diretório de trabalho

    // Define variáveis de ambiente para a aplicação
    env: {
      "FLASK_APP": "run.py",
      "FLASK_DEBUG": "0", // Modo debug desligado
      "PORT": "5000"     // Porta que o Flask vai usar
    }
  }]
}