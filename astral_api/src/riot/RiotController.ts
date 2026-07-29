import type {HonoApp} from '~/App';
import {DefaultUserOnly, LoginRequired} from '~/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '~/middleware/RateLimitMiddleware';
import {RateLimitConfigs} from '~/RateLimitConfig';
import {Validator} from '~/Validator';
import {RiotConnectRequest} from '~/riot/RiotModel';
import {RiotService} from '~/riot/RiotService';

const riotService = new RiotService();

export function RiotController(app: HonoApp): void {
	app.get(
		'/users/@me/integrations/riot',
		RateLimitMiddleware(RateLimitConfigs.RIOT_GET),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => ctx.json(await riotService.getStatus(ctx.get('user').id)),
	);

	app.post(
		'/users/@me/integrations/riot/connect',
		RateLimitMiddleware(RateLimitConfigs.RIOT_CONNECT),
		LoginRequired,
		DefaultUserOnly,
		Validator('json', RiotConnectRequest),
		async (ctx) => {
			const {game_name, tag_line, region} = ctx.req.valid('json');
			const result = await riotService.connect(ctx.get('user').id, game_name, tag_line, region);
			return ctx.json(result, result.ok ? 200 : 400);
		},
	);

	app.delete(
		'/users/@me/integrations/riot',
		RateLimitMiddleware(RateLimitConfigs.RIOT_CONNECT),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => {
			await riotService.disconnect(ctx.get('user').id);
			return ctx.body(null, 204);
		},
	);

	app.post(
		'/users/@me/integrations/riot/refresh',
		RateLimitMiddleware(RateLimitConfigs.RIOT_CONNECT),
		LoginRequired,
		DefaultUserOnly,
		async (ctx) => {
			const connection = await riotService.refresh(ctx.get('user').id);
			return ctx.json({connection});
		},
	);
}
