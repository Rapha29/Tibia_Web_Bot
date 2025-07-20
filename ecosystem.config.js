    module.exports = {
  apps: [
    {
      name: "gateway",
      script: "gateway.js",
      node_args: "--expose-gc",
      max_memory_restart: "300M"
    }
  ]
};
