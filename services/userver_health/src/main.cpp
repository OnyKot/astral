#include <health_handler.hpp>
#include <info_handler.hpp>

#include <astral/common/uptime.hpp>

#include <userver/components/minimal_server_component_list.hpp>
#include <userver/server/handlers/ping.hpp>
#include <userver/server/handlers/server_monitor.hpp>
#include <userver/utils/daemon_run.hpp>

int main(int argc, char* argv[]) {
    // Anchor process start time before DaemonMain so /health and /info
    // report real process uptime (not handler age).
    astral::common::ProcessClock::Init();

    auto component_list = userver::components::MinimalServerComponentList()
                              .Append<userver::server::handlers::Ping>()
                              .Append<userver::server::handlers::ServerMonitor>()
                              .Append<astral::userver_health::HealthHandler>()
                              .Append<astral::userver_health::InfoHandler>();

    return userver::utils::DaemonMain(argc, argv, component_list);
}
