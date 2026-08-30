// GET /api/me — текущий пользователь.
// Все данные приходят из Discord (через бота) и Steam; с сайта они не меняются.
const {
  getSession,
  json,
  discordBot,
  resolveRole,
  avatarUrl,
  steamIdStore,
  steamProfile,
} = require("./_lib");

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) return json(res, 401, { error: "unauthorized" });

  const guildId = process.env.DISCORD_GUILD_ID;

  const [member, steamId] = await Promise.all([
    guildId
      ? discordBot(`/guilds/${guildId}/members/${session.i}`).catch(() => null)
      : Promise.resolve(null),
    steamIdStore.get(req, session.i).catch(() => null),
  ]);

  const steam = steamId ? await steamProfile(steamId).catch(() => null) : null;

  json(res, 200, {
    user: {
      id: session.i,
      username: session.u,
      globalName: member?.nick || session.g,
      avatar: avatarUrl(session.i, session.a),
    },
    member: member
      ? {
          role: resolveRole(member.roles || []),
          joinedAt: member.joined_at,
        }
      : null,
    steam,
  });
};
