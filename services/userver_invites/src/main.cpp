#include "invite_handler.hpp"
#include "invite_upstream_client.hpp"

#include <astral/common/uptime.hpp>

#include <userver/clients/dns/component.hpp>
#include <userver/clients/http/component_list.hpp>
#include <userver/components/minimal_server_component_list.hpp>
#include <userver/server/handlers/ping.hpp>
#include <userver/server/handlers/server_monitor.hpp>
#include <userver/utils/daemon_run.hpp>

int main(int argc, char* argv[]) {
    astral::common::ProcessClock::Init();

    auto component_list = userver::components::MinimalServerComponentList()
                              .Append<userver::clients::dns::Component>()
                              .AppendComponentList(userver::clients::http::ComponentList())
                              .Append<userver::server::handlers::Ping>()
                              .Append<userver::server::handlers::ServerMonitor>()
                              .Append<astral::userver_invites::InviteUpstreamClient>()
                              .Append<astral::userver_invites::InviteHandler>();

    return userver::utils::DaemonMain(argc, argv, component_list);
}
