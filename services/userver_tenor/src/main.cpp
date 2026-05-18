// Copyright (C) 2026 Astral Contributors – AGPL-3.0-or-later
#include <userver/clients/dns/component.hpp>
#include <userver/clients/http/component_list.hpp>
#include <userver/components/minimal_server_component_list.hpp>
#include <userver/server/handlers/ping.hpp>
#include <userver/server/handlers/server_monitor.hpp>
#include <userver/utils/daemon_run.hpp>

#include "tenor_client.hpp"
#include "tenor_proxy_handler.hpp"

int main(int argc, char* argv[]) {
  auto component_list =
      userver::components::MinimalServerComponentList()
          .Append<userver::clients::dns::Component>()
          .AppendComponentList(userver::clients::http::ComponentList())
          .Append<userver::server::handlers::Ping>()
          .Append<userver::server::handlers::ServerMonitor>()
          .Append<astral::tenor::TenorClient>()
          .Append<astral::tenor::TenorProxyHandler>();

  return userver::utils::DaemonMain(argc, argv, component_list);
}
