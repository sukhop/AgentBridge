import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder
} from 'discord.js';
import { BaseMessenger } from '../../interfaces/messenger.js';
import { buildWorkspaceEmbedFields, STATUS_EMOJI } from '../../services/missionControl.js';

// Slash command surface. Each entry with `option` gets a single optional or
// required string option (project name/session id, a path, or free text) -
// enough for every command this project currently supports.
const COMMAND_DEFS = [
  { name: 'help', description: 'Show available commands' },
  { name: 'projects', description: 'List all registered projects and switch the active one' },
  { name: 'status', description: 'Show status for a project', option: { name: 'project', description: 'Project name (defaults to active)', required: false } },
  { name: 'use', description: 'Switch the active project', option: { name: 'project', description: 'Project name or session id', required: true } },
  { name: 'prompt', description: 'Send a prompt to the active project', option: { name: 'message', description: 'The prompt text', required: true } },
  { name: 'screenshot', description: 'Capture a screenshot of a project', option: { name: 'project', description: 'Project name (defaults to active)', required: false } },
  { name: 'logs', description: 'Show latest AgentBridge logs' },
  { name: 'history', description: 'Show conversation history for the active project' },
  { name: 'approve', description: 'Approve the pending action for a project', option: { name: 'project', description: 'Project name or session id', required: false } },
  { name: 'reject', description: 'Reject the pending action for a project', option: { name: 'project', description: 'Project name or session id', required: false } },
  { name: 'diff', description: 'Show the uncommitted git diff for a project', option: { name: 'project', description: 'Project name (defaults to active)', required: false } },
  { name: 'open', description: 'Open and register a project', option: { name: 'path', description: 'Absolute path to the project directory', required: true } },
  { name: 'restart', description: 'Restart the agent for a project', option: { name: 'project', description: 'Project name (defaults to active)', required: false } },
  { name: 'settings', description: 'Show AgentBridge settings' }
];

const NOTABLE_EVENT_TYPES = new Set(['completed', 'finished', 'failed', 'error']);

export default class DiscordMessengerPlugin extends BaseMessenger {
  constructor(opts) {
    super(opts);
    this.ClientClass = opts.ClientClass || Client;
    this.RestClass = opts.RestClass || REST;
    this.client = null;
    this.ready = false;
  }

  isReady() {
    return this.ready;
  }

  async connect() {
    const cfg = this.config.messengers?.discord;
    if (!cfg?.botToken) {
      const error = new Error('DISCORD_BOT_TOKEN is not configured.');
      error.expose = true;
      throw error;
    }
    if (!cfg.channelId) {
      const error = new Error('DISCORD_CHANNEL_ID is not configured.');
      error.expose = true;
      throw error;
    }

    this.client = new this.ClientClass({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
    });

    this.client.on(Events.InteractionCreate, (interaction) => {
      this.handleInteraction(interaction).catch((error) => {
        this.logger.error('Discord interaction handling failed', { stack: error.stack });
      });
    });

    this.client.on(Events.Error, (error) => {
      this.logger.error('Discord client error', { message: error.message });
    });

    await new Promise((resolve, reject) => {
      this.client.once(Events.ClientReady, () => resolve());
      this.client.login(cfg.botToken).catch(reject);
    });

    this.ready = true;
    await this.registerCommands(COMMAND_DEFS);
    this.logger.info('Discord bot is ready', { guildId: cfg.guildId || '(global)' });
  }

  async disconnect() {
    if (!this.client) return;
    await this.client.destroy();
    this.ready = false;
  }

  resolveChannelId(target) {
    return target?.channelId ?? this.config.messengers?.discord?.channelId;
  }

  async resolveChannel(target) {
    const channelId = this.resolveChannelId(target);
    if (!channelId) {
      throw new Error('No Discord channel configured.');
    }
    return this.client.channels.fetch(channelId);
  }

  async sendMessage(target, content) {
    const channel = await this.resolveChannel(target);
    const message = await channel.send(renderContent(content));
    return { messageId: message.id };
  }

  async editMessage(target, messageId, content) {
    const channel = await this.resolveChannel(target);
    const message = await channel.messages.fetch(messageId);
    await message.edit(renderContent(content));
  }

  async sendImage(target, imagePath, caption) {
    const channel = await this.resolveChannel(target);
    const message = await channel.send({ content: caption || undefined, files: [new AttachmentBuilder(imagePath)] });
    return { messageId: message.id };
  }

  async sendFile(target, filePath, caption) {
    const channel = await this.resolveChannel(target);
    const message = await channel.send({ content: caption || undefined, files: [new AttachmentBuilder(filePath)] });
    return { messageId: message.id };
  }

  async sendButtons(target, content, buttons) {
    const channel = await this.resolveChannel(target);
    const rows = buttons.map((row) => new ActionRowBuilder().addComponents(
      row.map((b) => new ButtonBuilder().setCustomId(b.action).setLabel(b.label).setStyle(mapButtonStyle(b.style)))
    ));
    const message = await channel.send({ ...renderContent(content), components: rows.slice(0, 5) });
    return { messageId: message.id };
  }

  async sendSelectMenu(target, content, options, placeholder) {
    const channel = await this.resolveChannel(target);
    const menu = new StringSelectMenuBuilder()
      .setCustomId('select-project')
      .setPlaceholder((placeholder || 'Choose...').slice(0, 150))
      .addOptions(options.slice(0, 25).map((o) => ({
        label: String(o.label).slice(0, 100),
        value: String(o.value),
        description: o.description ? String(o.description).slice(0, 100) : undefined
      })));
    const row = new ActionRowBuilder().addComponents(menu);
    const message = await channel.send({ ...renderContent(content), components: [row] });
    return { messageId: message.id };
  }

  async registerCommands(commandDefs = COMMAND_DEFS) {
    const cfg = this.config.messengers.discord;
    const body = commandDefs.map((def) => {
      const builder = new SlashCommandBuilder().setName(def.name).setDescription(def.description);
      if (def.option) {
        builder.addStringOption((opt) => opt
          .setName(def.option.name)
          .setDescription(def.option.description)
          .setRequired(Boolean(def.option.required)));
      }
      return builder.toJSON();
    });

    const rest = new this.RestClass({ version: '10' }).setToken(cfg.botToken);
    const clientId = this.client.application.id;
    const route = cfg.guildId
      ? Routes.applicationGuildCommands(clientId, cfg.guildId)
      : Routes.applicationCommands(clientId);

    await rest.put(route, { body });
    this.logger.info('Discord slash commands registered', { count: body.length, scope: cfg.guildId ? 'guild' : 'global' });
  }

  // Discord owns its own input loop end-to-end (see handleInteraction), the
  // same self-contained pattern Telegram uses. This still stores an
  // external handler for interface conformance / a future central dispatcher.
  receiveCommands(handler) {
    this.externalCommandHandler = handler;
  }

  isAuthorized(interaction) {
    const cfg = this.config.messengers?.discord || {};
    if (cfg.guildId && interaction.guildId !== cfg.guildId) return false;
    if (cfg.channelId && interaction.channelId && interaction.channelId !== cfg.channelId) return false;
    return true;
  }

  async handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
      return this.handleSlashCommand(interaction);
    }
    if (interaction.isButton()) {
      return this.handleButton(interaction);
    }
    if (interaction.isStringSelectMenu()) {
      return this.handleSelectMenu(interaction);
    }
  }

  async handleSlashCommand(interaction) {
    if (!this.isAuthorized(interaction)) {
      await interaction.reply({ content: 'Not authorized in this server/channel.', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    if (interaction.commandName === 'projects') {
      return this.replyWithProjectsSelector(interaction, 'editReply');
    }

    const def = COMMAND_DEFS.find((d) => d.name === interaction.commandName);
    const argValue = def?.option ? (interaction.options.getString(def.option.name) || '') : '';
    const text = argValue ? `/${interaction.commandName} ${argValue}` : `/${interaction.commandName}`;

    const response = await this.router.handle({
      text,
      sender: String(interaction.user.id),
      meta: { discordInteraction: interaction }
    });
    await this.renderInteractionResponse(interaction, response, 'editReply');
  }

  async handleButton(interaction) {
    if (!this.isAuthorized(interaction)) {
      await interaction.reply({ content: 'Not authorized in this server/channel.', ephemeral: true });
      return;
    }

    const [action, sessionId] = interaction.customId.split(':');

    if (action === 'sessions') {
      await interaction.deferReply({ ephemeral: true });
      return this.replyWithProjectsSelector(interaction, 'editReply');
    }

    if (action === 'activate') {
      try {
        await this.sessionManager.setActiveSession(sessionId);
        const name = this.sessionManager.getActiveSession()?.projectName || 'unknown';
        await interaction.reply({ content: `🟢 Active project is now: ${name}` });
      } catch (error) {
        await interaction.reply({ content: error.message, ephemeral: true });
      }
      return;
    }

    await interaction.deferUpdate();
    const commandText = sessionId ? `/${action} ${sessionId}` : `/${action}`;
    const response = await this.router.handle({
      text: commandText,
      sender: String(interaction.user.id),
      meta: { discordInteraction: interaction }
    });
    await this.renderInteractionResponse(interaction, response, 'followUp');
  }

  async handleSelectMenu(interaction) {
    if (!this.isAuthorized(interaction)) {
      await interaction.reply({ content: 'Not authorized in this server/channel.', ephemeral: true });
      return;
    }

    if (interaction.customId !== 'select-project') return;

    const sessionId = interaction.values[0];
    try {
      await this.sessionManager.setActiveSession(sessionId);
      const name = this.sessionManager.getActiveSession()?.projectName || 'unknown';
      await interaction.update({ content: `🟢 Active project is now: ${name}`, components: [] });
    } catch (error) {
      await interaction.reply({ content: error.message, ephemeral: true });
    }
  }

  async replyWithProjectsSelector(interaction, mode) {
    const sessions = this.sessionManager.getAllSessions();
    if (!sessions.length) {
      await interaction[mode]({ content: 'No registered projects or sessions found.' });
      return;
    }

    const options = sessions.slice(0, 25).map((s) => ({
      label: s.projectName.slice(0, 100),
      value: s.id,
      description: s.status.slice(0, 100)
    }));
    const menu = new StringSelectMenuBuilder()
      .setCustomId('select-project')
      .setPlaceholder('Switch active project...')
      .addOptions(options);
    const row = new ActionRowBuilder().addComponents(menu);

    const listText = sessions
      .map((s) => `${STATUS_EMOJI[s.status] ?? '⚪'} ${s.projectName} — ${s.status}`)
      .join('\n');

    await interaction[mode]({ content: `📂 Registered Projects:\n\n${listText}`, components: [row] });
  }

  async renderInteractionResponse(interaction, response, mode) {
    const text = response.text ?? 'Done.';
    const session = response.sessionId
      ? this.sessionManager.sessions.get(response.sessionId)
      : this.sessionManager.getActiveSession();
    const components = response.reply_markup ? [] : buildSessionButtonRows(session);

    if (response.mediaPath) {
      await interaction[mode]({ content: text, files: [new AttachmentBuilder(response.mediaPath)], components });
      return;
    }
    if (response.filePath) {
      await interaction[mode]({ content: text, files: [new AttachmentBuilder(response.filePath)] });
      return;
    }
    if (response.fileText) {
      const attachment = new AttachmentBuilder(Buffer.from(response.fileText, 'utf8'), {
        name: response.fileName ?? 'agentbridge-output.txt'
      });
      await interaction[mode]({ content: text, files: [attachment] });
      return;
    }

    await interaction[mode]({ content: truncateDiscordText(text), components });
  }

  // Renders every structured agent event into the persistent Mission
  // Control embed for its workspace (edited in place, never resent), plus a
  // distinct actionable message for events that need attention right now
  // (an approval, or a run finishing/failing).
  async notify(event) {
    if (!this.ready) return;
    const channelId = this.config.messengers?.discord?.channelId;
    if (!channelId) return;

    if (event.session) {
      await this.updateMissionControlEmbed(channelId, event.session);
    }

    if (event.type === 'approval-required' && event.session) {
      await this.sendApprovalCard(channelId, event);
      return;
    }

    if (NOTABLE_EVENT_TYPES.has(event.type)) {
      await this.sendMessage({ channelId }, event.text);
    }
  }

  async sendApprovalCard(channelId, event) {
    const channel = await this.client.channels.fetch(channelId);
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Approval Required')
      .setDescription(`**${event.session.projectName}**\n\n${event.approval?.command || event.approval?.title || event.text}`)
      .setColor(0xf1c40f);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`approve:${event.session.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject:${event.session.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`diff:${event.session.id}`).setLabel('View Diff').setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ embeds: [embed], components: [row] });
  }

  async updateMissionControlEmbed(channelId, session) {
    const fields = buildWorkspaceEmbedFields(session);
    const embed = new EmbedBuilder()
      .setTitle(fields.title)
      .setColor(fields.color)
      .addFields(fields.fields)
      .setFooter({ text: fields.footer });

    const channel = await this.client.channels.fetch(channelId);
    const ref = this.getMissionControlRef(session.id);

    if (ref?.messageId) {
      try {
        const message = await channel.messages.fetch(ref.messageId);
        await message.edit({ embeds: [embed] });
        return;
      } catch (error) {
        this.logger.debug('Mission Control message missing, sending a new one', {
          sessionId: session.id,
          error: error.message
        });
      }
    }

    const message = await channel.send({ embeds: [embed] });
    await this.setMissionControlRef(session.id, { channelId, messageId: message.id });
  }

  getMissionControlRef(sessionId) {
    const state = this.storage.getState();
    return state.discordMissionControl?.[sessionId];
  }

  async setMissionControlRef(sessionId, ref) {
    const state = this.storage.getState();
    const discordMissionControl = { ...(state.discordMissionControl || {}), [sessionId]: ref };
    await this.storage.setState({ discordMissionControl });
  }
}

function renderContent(content) {
  if (typeof content === 'string') {
    return { content: truncateDiscordText(content) };
  }
  if (content?.embed) {
    const embed = new EmbedBuilder()
      .setTitle(content.embed.title)
      .setColor(content.embed.color ?? 0x3498db);
    if (content.embed.fields) embed.addFields(content.embed.fields);
    if (content.embed.footer) embed.setFooter({ text: content.embed.footer });
    return { embeds: [embed] };
  }
  return { content: truncateDiscordText(content?.text) };
}

function truncateDiscordText(text) {
  if (!text) return 'Done.';
  return text.length > 1900 ? `${text.slice(0, 1900)}\n\n[truncated]` : text;
}

function mapButtonStyle(style) {
  switch (style) {
    case 'danger': return ButtonStyle.Danger;
    case 'success': return ButtonStyle.Success;
    case 'secondary': return ButtonStyle.Secondary;
    default: return ButtonStyle.Primary;
  }
}

// Mirrors telegramService.js's buildSessionKeyboard() in Discord's native
// component idiom: Approve/Reject/View Diff only when a real approval is
// pending, every button scoped to this project's session id.
function buildSessionButtonRows(session) {
  if (!session) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sessions').setLabel('📂 Projects').setStyle(ButtonStyle.Secondary)
    )];
  }

  const rows = [];
  if (session.approvalPending) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`approve:${session.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject:${session.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`diff:${session.id}`).setLabel('View Diff').setStyle(ButtonStyle.Secondary)
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`screenshot:${session.id}`).setLabel('Screenshot').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`status:${session.id}`).setLabel('Status').setStyle(ButtonStyle.Primary)
  ));
  if (session.status !== 'Closed') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`stop:${session.id}`).setLabel('Stop').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`resume:${session.id}`).setLabel('Resume').setStyle(ButtonStyle.Success)
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sessions').setLabel('📂 Projects').setStyle(ButtonStyle.Secondary)
  ));

  return rows.slice(0, 5);
}
