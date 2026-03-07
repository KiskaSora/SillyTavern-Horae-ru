/**
 * Horae - Плагин Хроники Времени 
 * Система усиления памяти ИИ на основе временных якорей
 * 
 * Автор: SenriYuki
 * Версия: 1.8.4
 */

import { renderExtensionTemplateAsync, getContext, extension_settings } from '/scripts/extensions.js';
import { getSlideToggleOptions, saveSettingsDebounced, eventSource, event_types } from '/script.js';
import { slideToggle } from '/lib.js';

import { horaeManager, createEmptyMeta } from './core/horaeManager.js';
import { vectorManager } from './core/vectorManager.js';
import { calculateRelativeTime, calculateDetailedRelativeTime, formatRelativeTime, generateTimeReference, getCurrentSystemTime, formatStoryDate, formatFullDateTime, parseStoryDate } from './utils/timeUtils.js';

// ============================================
// Константы
// ============================================
const EXTENSION_NAME = 'horae';
const EXTENSION_FOLDER = `third-party/SillyTavern-Horae`;
const TEMPLATE_PATH = `${EXTENSION_FOLDER}/assets/templates`;
const VERSION = '1.8.4';

// Сопутствующие правила регулярных выражений (автоматически внедряются в нативную систему ST)
const HORAE_REGEX_RULES = [
    {
        id: 'horae_hide',
        scriptName: 'Horae - Скрыть теги состояния',
        description: 'Скрывает теги состояния <horae>, не отображаются в тексте и не отправляются ИИ',
        findRegex: '/(?:<horae>(?:(?!<\\/think(?:ing)?>)[\\s\\S])*?<\\/horae>|<!--horae[\\s\\S]*?-->)/gim',
        replaceString: '',
        trimStrings: [],
        placement: [2],
        disabled: false,
        markdownOnly: true,
        promptOnly: true,
        runOnEdit: true,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    },
    {
        id: 'horae_event_display_only',
        scriptName: 'Horae - Скрыть теги событий',
        description: 'Скрывает отображение тегов событий <horaeevent>, не отправляются ИИ',
        findRegex: '/<horaeevent>(?:(?!<\\/think(?:ing)?>)[\\s\\S])*?<\\/horaeevent>/gim',
        replaceString: '',
        trimStrings: [],
        placement: [2],
        disabled: false,
        markdownOnly: true,
        promptOnly: true,
        runOnEdit: true,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    },
    {
        id: 'horae_table_hide',
        scriptName: 'Horae - Скрыть теги таблиц',
        description: 'Скрывает теги <horaetable>, не отображаются в тексте и не отправляются ИИ',
        findRegex: '/<horaetable[:\\uff1a][\\s\\S]*?<\\/horaetable>/gim',
        replaceString: '',
        trimStrings: [],
        placement: [2],
        disabled: false,
        markdownOnly: true,
        promptOnly: true,
        runOnEdit: true,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    },
    {
        id: 'horae_rpg_hide',
        scriptName: 'Horae - Скрыть теги RPG',
        description: 'Скрывает теги <horaerpg>, не отображаются в тексте и не отправляются ИИ',
        findRegex: '/<horaerpg>(?:(?!<\\/think(?:ing)?>)[\\s\\S])*?<\\/horaerpg>/gim',
        replaceString: '',
        trimStrings: [],
        placement: [2],
        disabled: false,
        markdownOnly: true,
        promptOnly: true,
        runOnEdit: true,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    },
];

// ============================================
// Настройки по умолчанию
// ============================================
const DEFAULT_SETTINGS = {
    enabled: true,
    autoParse: true,
    injectContext: true,
    showMessagePanel: true,
    contextDepth: 15,
    injectionPosition: 1,
    lastStoryDate: '',
    lastStoryTime: '',
    favoriteNpcs: [],  // Список NPC со звёздочкой, отмеченных пользователем
    pinnedNpcs: [],    // Список важных персонажей, помеченных вручную (особая рамка)
    // Управление отправляемым ИИ содержимым
    sendTimeline: true,    // Отправлять хронологию сюжета (при отключении невозможен расчёт относительного времени)
    sendCharacters: true,  // Отправлять информацию о персонажах (одежда, расположение)
    sendItems: true,       // Отправлять инвентарь
    customTables: [],      // Пользовательские таблицы [{id, name, rows, cols, data, prompt}]
    customSystemPrompt: '',      // Пользовательский системный промпт (пусто = по умолчанию)
    customBatchPrompt: '',       // Пользовательский промпт для ИИ-сводки (пусто = по умолчанию)
    customAnalysisPrompt: '',    // Пользовательский промпт для ИИ-анализа (пусто = по умолчанию)
    customCompressPrompt: '',    // Пользовательский промпт для сжатия сюжета (пусто = по умолчанию)
    customAutoSummaryPrompt: '', // Пользовательский промпт для авто-сводки (пусто = по умолчанию; независимо от ручного сжатия)
    aiScanIncludeNpc: false,     // Извлекать ли NPC при ИИ-анализе
    aiScanIncludeAffection: false, // Извлекать ли расположение при ИИ-анализе
    aiScanIncludeScene: false,    // Извлекать ли память о локациях при ИИ-анализе
    aiScanIncludeRelationship: false, // Извлекать ли сеть отношений при ИИ-анализе
    panelWidth: 100,               // Ширина панели сообщений в процентах (50–100)
    panelOffset: 0,                // Смещение панели сообщений вправо (px)
    themeMode: 'dark',             // Тема плагина: dark / light / custom-{index}
    customCSS: '',                 // Пользовательский CSS
    customThemes: [],              // Импортированные темы оформления [{name, author, variables, css}]
    globalTables: [],              // Глобальные таблицы (общие для всех карточек персонажей)
    showTopIcon: true,             // Показывать иконку в верхней панели навигации
    customTablesPrompt: '',        // Пользовательский промпт для правил заполнения таблиц (пусто = по умолчанию)
    sendLocationMemory: false,     // Отправлять память о локациях (описание постоянных характеристик мест)
    customLocationPrompt: '',      // Пользовательский промпт для памяти о локациях (пусто = по умолчанию)
    sendRelationships: false,      // Отправлять сеть отношений
    sendMood: false,               // Отправлять данные отслеживания эмоций/психологического состояния
    customRelationshipPrompt: '',  // Пользовательский промпт для сети отношений (пусто = по умолчанию)
    customMoodPrompt: '',          // Пользовательский промпт для отслеживания эмоций (пусто = по умолчанию)
    // Авто-сводка
    autoSummaryEnabled: false,      // Переключатель авто-сводки
    autoSummaryKeepRecent: 10,      // Хранить последние N сообщений без сжатия
    autoSummaryBufferMode: 'messages', // 'messages' | 'tokens'
    autoSummaryBufferLimit: 20,     // Буферный порог (число сообщений или токенов)
    autoSummaryBatchMaxMsgs: 50,    // Макс. сообщений за один раз
    autoSummaryBatchMaxTokens: 80000, // Макс. токенов за один раз
    autoSummaryUseCustomApi: false, // Использовать ли отдельный API-эндпоинт
    autoSummaryApiUrl: '',          // Адрес отдельного API-эндпоинта (совместим с OpenAI)
    autoSummaryApiKey: '',          // Ключ отдельного API
    autoSummaryModel: '',           // Название модели для отдельного API
    antiParaphraseMode: false,      // Режим без пересказа: при ответе ИИ учитывает последнее сообщение пользователя
    sideplayMode: false,            // Режим побочной сцены: после включения можно отмечать сообщения для пропуска Horae
    // RPG-режим
    rpgMode: false,                 // Главный переключатель RPG-режима
    sendRpgBars: true,              // Отправлять полосы атрибутов (HP/MP/SP/состояния)
    sendRpgSkills: true,            // Отправлять список навыков
    sendRpgAttributes: true,        // Отправлять многомерную панель атрибутов
    rpgBarConfig: [
        { key: 'hp', name: 'HP', color: '#22c55e' },
        { key: 'mp', name: 'MP', color: '#6366f1' },
        { key: 'sp', name: 'SP', color: '#f59e0b' },
    ],
    rpgAttributeConfig: [
        { key: 'str', name: 'Сила', desc: 'Физическая атака, грузоподъёмность и урон в ближнем бою' },
        { key: 'dex', name: 'Ловкость', desc: 'Рефлексы, уклонение и точность дальнего боя' },
        { key: 'con', name: 'Телосложение', desc: 'Жизнеспособность, выносливость и сопротивление яду' },
        { key: 'int', name: 'Интеллект', desc: 'Знания, магия и способность к рассуждению' },
        { key: 'wis', name: 'Мудрость', desc: 'Проницательность, интуиция и сила воли' },
        { key: 'cha', name: 'Харизма', desc: 'Убеждение, лидерство и обаяние' },
    ],
    rpgAttrViewMode: 'radar',       // 'radar' или 'text'
    customRpgPrompt: '',            // Пользовательский промпт для RPG (пусто = по умолчанию)
    rpgDiceEnabled: false,          // Панель кубиков RPG
    dicePosX: null,                 // Позиция X панели кубиков (null = правый нижний угол по умолчанию)
    dicePosY: null,                 // Позиция Y панели кубиков
    // Обучение
    tutorialCompleted: false,       // Завершено ли вводное обучение для нового пользователя
    // Векторная память
    vectorEnabled: false,
    vectorSource: 'local',             // 'local' = локальная модель, 'api' = удалённый API
    vectorModel: 'Xenova/bge-small-zh-v1.5',
    vectorDtype: 'q8',
    vectorApiUrl: '',                  // Адрес Embedding API, совместимого с OpenAI
    vectorApiKey: '',                  // Ключ API
    vectorApiModel: '',                // Название удалённой Embedding-модели
    vectorPureMode: false,             // Режим чистых векторов (оптимизация для мощных моделей, отключает эвристику ключевых слов)
    vectorRerankEnabled: false,        // Включить вторичную сортировку Rerank
    vectorRerankFullText: false,       // Rerank использует полный текст вместо сводок (требует модель с длинным контекстом, например Qwen3-Reranker)
    vectorRerankModel: '',             // Название Rerank-модели
    vectorRerankUrl: '',               // Адрес Rerank API (пусто = использовать адрес Embedding API)
    vectorRerankKey: '',               // Ключ Rerank API (пусто = использовать ключ Embedding API)
    vectorTopK: 5,
    vectorThreshold: 0.72,
    vectorFullTextCount: 3,
    vectorFullTextThreshold: 0.9,
};

// ============================================
// Глобальные переменные
// ============================================
let settings = { ...DEFAULT_SETTINGS };
let doNavbarIconClick = null;
let isInitialized = false;
let _isSummaryGeneration = false;
let _summaryInProgress = false;
let itemsMultiSelectMode = false;  // Режим множественного выбора предметов
let selectedItems = new Set();     // Названия выбранных предметов
let longPressTimer = null;         // Таймер долгого нажатия
let agendaMultiSelectMode = false; // Режим множественного выбора задач
let selectedAgendaIndices = new Set(); // Индексы выбранных задач
let agendaLongPressTimer = null;   // Таймер долгого нажатия для задач
let npcMultiSelectMode = false;     // Режим множественного выбора NPC
let selectedNpcs = new Set();       // Названия выбранных NPC
let timelineMultiSelectMode = false; // Режим множественного выбора хронологии
let selectedTimelineEvents = new Set(); // Выбранные события (формат "msgIndex-eventIndex")
let timelineLongPressTimer = null;  // Таймер долгого нажатия для хронологии

// ============================================
// Вспомогательные функции
// ============================================


/** Автоматически внедряет регулярные выражения в нативную систему ST (всегда в конце, чтобы не конфликтовать с другими) */
function ensureRegexRules() {
    if (!extension_settings.regex) extension_settings.regex = [];

    let changed = 0;
    for (const rule of HORAE_REGEX_RULES) {
        const idx = extension_settings.regex.findIndex(r => r.id === rule.id);
        if (idx !== -1) {
            // Сохраняет состояние disabled пользователя, удаляет старую позицию
            const userDisabled = extension_settings.regex[idx].disabled;
            extension_settings.regex.splice(idx, 1);
            extension_settings.regex.push({ ...rule, disabled: userDisabled });
            changed++;
        } else {
            extension_settings.regex.push({ ...rule });
            changed++;
        }
    }

    if (changed > 0) {
        saveSettingsDebounced();
        console.log(`[Horae] Регулярные выражения синхронизированы в конец списка (всего ${HORAE_REGEX_RULES.length}  шт.)`);
    }
}

/** Получить HTML-шаблон */
async function getTemplate(name) {
    return await renderExtensionTemplateAsync(TEMPLATE_PATH, name);
}

/**
 * Проверить, используется ли новая версия навигационной панели
 */
function isNewNavbarVersion() {
    return typeof doNavbarIconClick === 'function';
}

/**
 * Инициализировать функцию клика по навигационной панели
 */
async function initNavbarFunction() {
    try {
        const scriptModule = await import('/script.js');
        if (scriptModule.doNavbarIconClick) {
            doNavbarIconClick = scriptModule.doNavbarIconClick;
        }
    } catch (error) {
        console.warn(`[Horae] doNavbarIconClick недоступен, используется устаревший режим ящика`);
    }
}

/**
 * Загрузить настройки
 */
let _isFirstTimeUser = false;
function loadSettings() {
    if (extension_settings[EXTENSION_NAME]) {
        settings = { ...DEFAULT_SETTINGS, ...extension_settings[EXTENSION_NAME] };
    } else {
        _isFirstTimeUser = true;
        extension_settings[EXTENSION_NAME] = { ...DEFAULT_SETTINGS };
        settings = { ...DEFAULT_SETTINGS };
    }
}

/** Миграция старой конфигурации атрибутов на шесть параметров DnD */
function _migrateAttrConfig() {
    const cfg = settings.rpgAttributeConfig;
    if (!cfg || !Array.isArray(cfg)) return;
    const oldKeys = cfg.map(a => a.key).sort().join(',');
    // Старые значения по умолчанию (4 параметра: con,int,spr,str)
    if (oldKeys === 'con,int,spr,str' && cfg.length === 4) {
        settings.rpgAttributeConfig = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.rpgAttributeConfig));
        saveSettings();
        console.log('[Horae] Конфигурация панели атрибутов автоматически перенесена на шесть параметров DnD');
    }
}

/**
 * Сохранить настройки
 */
function saveSettings() {
    extension_settings[EXTENSION_NAME] = settings;
    saveSettingsDebounced();
}

/**
 * Показать всплывающее уведомление
 */
function showToast(message, type = 'info') {
    if (window.toastr) {
        toastr[type](message, 'Horae');
    } else {
        console.log(`[Horae] ${type}: ${message}`);
    }
}

/** Получить пользовательские таблицы текущего диалога */
function getChatTables() {
    const context = getContext();
    if (!context?.chat?.length) return [];
    
    const firstMessage = context.chat[0];
    if (firstMessage?.horae_meta?.customTables) {
        return firstMessage.horae_meta.customTables;
    }
    
    // Совместимость с устаревшей версией: проверка свойств массива chat
    if (context.chat.horae_tables) {
        return context.chat.horae_tables;
    }
    
    return [];
}

/** Установить пользовательские таблицы текущего диалога */
function setChatTables(tables) {
    const context = getContext();
    if (!context?.chat?.length) return;
    
    if (!context.chat[0].horae_meta) {
        context.chat[0].horae_meta = createEmptyMeta();
    }
    
    // Снимок baseData для отката
    for (const table of tables) {
        table.baseData = JSON.parse(JSON.stringify(table.data || {}));
        table.baseRows = table.rows || 2;
        table.baseCols = table.cols || 2;
    }
    
    context.chat[0].horae_meta.customTables = tables;
    getContext().saveChat();
}

/** Получить список глобальных таблиц (возвращает объединение структуры и данных текущей карточки) */
function getGlobalTables() {
    const templates = settings.globalTables || [];
    const chat = horaeManager.getChat();
    if (!chat?.[0]) return templates.map(t => ({ ...t }));

    const firstMsg = chat[0];
    if (!firstMsg.horae_meta) return templates.map(t => ({ ...t }));
    if (!firstMsg.horae_meta.globalTableData) firstMsg.horae_meta.globalTableData = {};
    const perCardData = firstMsg.horae_meta.globalTableData;

    return templates.map(template => {
        const name = (template.name || '').trim();
        const overlay = perCardData[name];
        if (overlay) {
            return {
                id: template.id,
                name: template.name,
                prompt: template.prompt,
                lockedRows: template.lockedRows || [],
                lockedCols: template.lockedCols || [],
                lockedCells: template.lockedCells || [],
                data: overlay.data || {},
                rows: overlay.rows ?? template.rows,
                cols: overlay.cols ?? template.cols,
                baseData: overlay.baseData,
                baseRows: overlay.baseRows ?? template.baseRows,
                baseCols: overlay.baseCols ?? template.baseCols,
            };
        }
        // Нет данных для карточки: возвращается только заголовок
        const headerData = {};
        for (const key of Object.keys(template.data || {})) {
            const [r, c] = key.split('-').map(Number);
            if (r === 0 || c === 0) headerData[key] = template.data[key];
        }
        return {
            ...template,
            data: headerData,
            baseData: {},
            baseRows: template.baseRows ?? template.rows ?? 2,
            baseCols: template.baseCols ?? template.cols ?? 2,
        };
    });
}

/** Сохранить список глобальных таблиц (структура → настройки, данные → текущая карточка) */
function setGlobalTables(tables) {
    const chat = horaeManager.getChat();

    // Сохранить данные карточки в текущую карточку
    if (chat?.[0]) {
        if (!chat[0].horae_meta) return;
        if (!chat[0].horae_meta.globalTableData) chat[0].horae_meta.globalTableData = {};
        const perCardData = chat[0].horae_meta.globalTableData;

        // Очистить данные карточки для удалённых таблиц
        const currentNames = new Set(tables.map(t => (t.name || '').trim()).filter(Boolean));
        for (const key of Object.keys(perCardData)) {
            if (!currentNames.has(key)) delete perCardData[key];
        }

        for (const table of tables) {
            const name = (table.name || '').trim();
            if (!name) continue;
            perCardData[name] = {
                data: JSON.parse(JSON.stringify(table.data || {})),
                rows: table.rows || 2,
                cols: table.cols || 2,
                baseData: JSON.parse(JSON.stringify(table.data || {})),
                baseRows: table.rows || 2,
                baseCols: table.cols || 2,
            };
        }
    }

    // Сохранять только структуру (заголовки) в глобальные настройки
    settings.globalTables = tables.map(table => {
        const headerData = {};
        for (const key of Object.keys(table.data || {})) {
            const [r, c] = key.split('-').map(Number);
            if (r === 0 || c === 0) headerData[key] = table.data[key];
        }
        return {
            id: table.id,
            name: table.name,
            rows: table.rows || 2,
            cols: table.cols || 2,
            data: headerData,
            prompt: table.prompt || '',
            lockedRows: table.lockedRows || [],
            lockedCols: table.lockedCols || [],
            lockedCells: table.lockedCells || [],
        };
    });
    saveSettings();
}

/** Получить таблицы для указанного scope */
function getTablesByScope(scope) {
    return scope === 'global' ? getGlobalTables() : getChatTables();
}

/** Сохранить таблицы для указанного scope */
function setTablesByScope(scope, tables) {
    if (scope === 'global') {
        setGlobalTables(tables);
    } else {
        setChatTables(tables);
    }
}

/** Получить все объединённые таблицы (для внедрения в промпт) */
function getAllTables() {
    return [...getGlobalTables(), ...getChatTables()];
}

// ============================================
// Хранилище задач (Agenda) — привязано к текущему диалогу
// ============================================

/**
 * Получить задачи, созданные вручную пользователем (хранятся в chat[0])
 */
function getUserAgenda() {
    const context = getContext();
    if (!context?.chat?.length) return [];
    
    const firstMessage = context.chat[0];
    if (firstMessage?.horae_meta?.agenda) {
        return firstMessage.horae_meta.agenda;
    }
    return [];
}

/**
 * Установить задачи, созданные вручную пользователем (хранятся в chat[0])
 */
function setUserAgenda(agenda) {
    const context = getContext();
    if (!context?.chat?.length) return;
    
    if (!context.chat[0].horae_meta) {
        context.chat[0].horae_meta = createEmptyMeta();
    }
    
    context.chat[0].horae_meta.agenda = agenda;
    getContext().saveChat();
}

/**
 * Получить все задачи (пользовательские + ИИ), вернуть в унифицированном формате
 * Каждый элемент: { text, date, source: 'user'|'ai', done, createdAt, _msgIndex? }
 */
function getAllAgenda() {
    const all = [];
    
    // 1. Созданные пользователем вручную
    const userItems = getUserAgenda();
    for (const item of userItems) {
        if (item._deleted) continue;
        all.push({
            text: item.text,
            date: item.date || '',
            source: item.source || 'user',
            done: !!item.done,
            createdAt: item.createdAt || 0,
            _store: 'user',
            _index: all.length
        });
    }
    
    // 2. Записанные ИИ (хранятся в horae_meta.agenda каждого сообщения)
    const context = getContext();
    if (context?.chat) {
        for (let i = 1; i < context.chat.length; i++) {
            const meta = context.chat[i].horae_meta;
            if (meta?.agenda?.length > 0) {
                for (const item of meta.agenda) {
                    if (item._deleted) continue;
                    // Дедупликация: проверить, существует ли уже такой же элемент
                    const isDupe = all.some(a => a.text === item.text);
                    if (!isDupe) {
                        all.push({
                            text: item.text,
                            date: item.date || '',
                            source: 'ai',
                            done: !!item.done,
                            createdAt: item.createdAt || 0,
                            _store: 'msg',
                            _msgIndex: i,
                            _index: all.length
                        });
                    }
                }
            }
        }
    }
    
    return all;
}

/**
 * Переключить состояние выполнения задачи по глобальному индексу
 */
function toggleAgendaDone(agendaItem, done) {
    const context = getContext();
    if (!context?.chat) return;
    
    if (agendaItem._store === 'user') {
        const agenda = getUserAgenda();
        // Поиск по тексту (более надёжно)
        const found = agenda.find(a => a.text === agendaItem.text);
        if (found) {
            found.done = done;
            setUserAgenda(agenda);
        }
    } else if (agendaItem._store === 'msg') {
        const msg = context.chat[agendaItem._msgIndex];
        if (msg?.horae_meta?.agenda) {
            const found = msg.horae_meta.agenda.find(a => a.text === agendaItem.text);
            if (found) {
                found.done = done;
                getContext().saveChat();
            }
        }
    }
}

/**
 * Удалить указанную задачу
 */
function deleteAgendaItem(agendaItem) {
    const context = getContext();
    if (!context?.chat) return;
    const targetText = agendaItem.text;
    
    // Пометить все совпадающие элементы как _deleted (предотвращает воскрешение одноимённых элементов из других сообщений)
    if (context.chat[0]?.horae_meta?.agenda) {
        for (const a of context.chat[0].horae_meta.agenda) {
            if (a.text === targetText) a._deleted = true;
        }
    }
    for (let i = 1; i < context.chat.length; i++) {
        const meta = context.chat[i]?.horae_meta;
        if (meta?.agenda?.length > 0) {
            for (const a of meta.agenda) {
                if (a.text === targetText) a._deleted = true;
            }
        }
    }
    
    // Одновременно записывать удалённый текст в chat[0] для использования при перестройке
    if (!context.chat[0].horae_meta) context.chat[0].horae_meta = createEmptyMeta();
    if (!context.chat[0].horae_meta._deletedAgendaTexts) context.chat[0].horae_meta._deletedAgendaTexts = [];
    if (!context.chat[0].horae_meta._deletedAgendaTexts.includes(targetText)) {
        context.chat[0].horae_meta._deletedAgendaTexts.push(targetText);
    }
    getContext().saveChat();
}

/**
 * Экспортировать таблицу в JSON
 */
function exportTable(tableIndex, scope = 'local') {
    const tables = getTablesByScope(scope);
    const table = tables[tableIndex];
    if (!table) return;

    const exportData = JSON.stringify(table, null, 2);
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `horae_table_${table.name || tableIndex}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showToast('Таблица экспортирована', 'success');
}

/**
 * Импортировать таблицу
 */
function importTable(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const tableData = JSON.parse(e.target.result);
            if (!tableData || typeof tableData !== 'object') {
                throw new Error('Недействительные данные таблицы');
            }
            
            const newTable = {
                id: Date.now().toString(),
                name: tableData.name || 'Импортированная таблица',
                rows: tableData.rows || 2,
                cols: tableData.cols || 2,
                data: tableData.data || {},
                prompt: tableData.prompt || ''
            };
            
            // Установить baseData как полные импортированные данные, чтобы не потерять при rebuildTableData
            newTable.baseData = JSON.parse(JSON.stringify(newTable.data));
            newTable.baseRows = newTable.rows;
            newTable.baseCols = newTable.cols;
            
            // Очистить старые записи вклада ИИ для таблицы с тем же именем, чтобы предотвратить возврат старых данных при перестройке
            const importName = (newTable.name || '').trim();
            if (importName) {
                const chat = horaeManager.getChat();
                if (chat?.length) {
                    for (let i = 0; i < chat.length; i++) {
                        const meta = chat[i]?.horae_meta;
                        if (meta?.tableContributions) {
                            meta.tableContributions = meta.tableContributions.filter(
                                tc => (tc.name || '').trim() !== importName
                            );
                            if (meta.tableContributions.length === 0) {
                                delete meta.tableContributions;
                            }
                        }
                    }
                }
            }
            
            const tables = getChatTables();
            tables.push(newTable);
            setChatTables(tables);
            
            renderCustomTablesList();
            showToast('Таблица импортирована', 'success');
        } catch (err) {
            showToast('Ошибка импорта: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

// ============================================
// Функции рендеринга UI
// ============================================

/**
 * Обновить отображение страницы статуса
 */
function updateStatusDisplay() {
    const state = horaeManager.getLatestState();
    
    // Обновить отображение времени (показывать день недели в стандартном календаре)
    const dateEl = document.getElementById('horae-current-date');
    const timeEl = document.getElementById('horae-current-time');
    if (dateEl) {
        const dateStr = state.timestamp?.story_date || '--/--';
        const parsed = parseStoryDate(dateStr);
        // Добавить день недели в стандартный календарь
        if (parsed && parsed.type === 'standard') {
            dateEl.textContent = formatStoryDate(parsed, true);
        } else {
            dateEl.textContent = dateStr;
        }
    }
    if (timeEl) timeEl.textContent = state.timestamp?.story_time || '--:--';
    
    // Обновить отображение места
    const locationEl = document.getElementById('horae-current-location');
    if (locationEl) locationEl.textContent = state.scene?.location || 'Не задано';
    
    // Обновить атмосферу
    const atmosphereEl = document.getElementById('horae-current-atmosphere');
    if (atmosphereEl) atmosphereEl.textContent = state.scene?.atmosphere || '';
    
    // Обновить список одежды (только для присутствующих персонажей)
    const costumesEl = document.getElementById('horae-costumes-list');
    if (costumesEl) {
        const presentChars = state.scene?.characters_present || [];
        const allCostumes = Object.entries(state.costumes || {});
        // Фильтрация: оставить только персонажей из characters_present
        const entries = presentChars.length > 0
            ? allCostumes.filter(([char]) => presentChars.some(p => p === char || char.includes(p) || p.includes(char)))
            : allCostumes;
        if (entries.length === 0) {
            costumesEl.innerHTML = '<div class="horae-empty-hint">Нет записей об одежде присутствующих персонажей</div>';
        } else {
            costumesEl.innerHTML = entries.map(([char, costume]) => `
                <div class="horae-costume-item">
                    <span class="horae-costume-char">${char}</span>
                    <span class="horae-costume-desc">${costume}</span>
                </div>
            `).join('');
        }
    }
    
    // Обновить краткий список предметов
    const itemsEl = document.getElementById('horae-items-quick');
    if (itemsEl) {
        const entries = Object.entries(state.items || {});
        if (entries.length === 0) {
            itemsEl.innerHTML = '<div class="horae-empty-hint">Нет отслеживаемых предметов</div>';
        } else {
            itemsEl.innerHTML = entries.map(([name, info]) => {
                const icon = info.icon || '📦';
                const holderStr = info.holder ? `<span class="holder">${info.holder}</span>` : '';
                const locationStr = info.location ? `<span class="location">@ ${info.location}</span>` : '';
                return `<div class="horae-item-tag">${icon} ${name} ${holderStr} ${locationStr}</div>`;
            }).join('');
        }
    }
}

/**
 * Обновить отображение хронологии
 */
function updateTimelineDisplay() {
    const filterLevel = document.getElementById('horae-timeline-filter')?.value || 'all';
    const searchKeyword = (document.getElementById('horae-timeline-search')?.value || '').trim().toLowerCase();
    let events = horaeManager.getEvents(0, filterLevel);
    const listEl = document.getElementById('horae-timeline-list');
    
    if (!listEl) return;
    
    // Фильтрация по ключевым словам
    if (searchKeyword) {
        events = events.filter(e => {
            const summary = (e.event?.summary || '').toLowerCase();
            const date = (e.timestamp?.story_date || '').toLowerCase();
            const level = (e.event?.level || '').toLowerCase();
            return summary.includes(searchKeyword) || date.includes(searchKeyword) || level.includes(searchKeyword);
        });
    }
    
    if (events.length === 0) {
        const filterText = filterLevel === 'all' ? '' : `уровня «${filterLevel}»`;
        const searchText = searchKeyword ? `с «${searchKeyword}»` : '';
        listEl.innerHTML = `
            <div class="horae-empty-state">
                <i class="fa-regular fa-clock"></i>
                <span>Нет ${searchText}${filterText}записанных событий</span>
            </div>
        `;
        return;
    }
    
    const state = horaeManager.getLatestState();
    const currentDate = state.timestamp?.story_date || getCurrentSystemTime().date;
    
    // Обновить состояние кнопки множественного выбора
    const msBtn = document.getElementById('horae-btn-timeline-multiselect');
    if (msBtn) {
        msBtn.classList.toggle('active', timelineMultiSelectMode);
        msBtn.title = timelineMultiSelectMode ? 'Выйти из режима выбора' : 'Режим выбора';
    }
    
    // Получить карту сводок (summaryId → запись) для определения состояния сжатия
    const chat = horaeManager.getChat();
    const summaries = chat?.[0]?.horae_meta?.autoSummaries || [];
    const activeSummaryIds = new Set(summaries.filter(s => s.active).map(s => s.id));
    
    listEl.innerHTML = events.reverse().map(e => {
        const isSummary = e.event?.isSummary || e.event?.level === '摘要';
        const compressedBy = e.event?._compressedBy;
        const summaryId = e.event?._summaryId;
        
        // Сжатые события: скрываются когда соответствующая сводка активна
        if (compressedBy && activeSummaryIds.has(compressedBy)) {
            return '';
        }
        // События сводки: при inactive рендерятся как свёрнутый индикатор (кнопка переключения остаётся)
        if (summaryId && !activeSummaryIds.has(summaryId)) {
            const summaryEntry = summaries.find(s => s.id === summaryId);
            const rangeStr = summaryEntry ? `#${summaryEntry.range[0]}-#${summaryEntry.range[1]}` : '';
            return `
            <div class="horae-timeline-item summary horae-summary-collapsed" data-message-id="${e.messageIndex}" data-summary-id="${summaryId}">
                <div class="horae-timeline-summary-icon"><i class="fa-solid fa-file-lines"></i></div>
                <div class="horae-timeline-content">
                    <div class="horae-timeline-summary"><span class="horae-level-badge summary">Сводка</span> развёрнута в исходные события</div>
                    <div class="horae-timeline-meta">${rangeStr} · ${summaryEntry?.auto ? 'авто' : 'ручная'} сводка</div>
                </div>
                <div class="horae-summary-actions">
                    <button class="horae-summary-toggle-btn" data-summary-id="${summaryId}" title="Переключить на сводку">
                        <i class="fa-solid fa-compress"></i>
                    </button>
                    <button class="horae-summary-delete-btn" data-summary-id="${summaryId}" title="Удалить сводку">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>`;
        }
        
        const result = calculateDetailedRelativeTime(
            e.timestamp?.story_date || '',
            currentDate
        );
        const relTime = result.relative;
        const levelClass = isSummary ? 'summary' :
                          e.event?.level === '关键' ? 'critical' : 
                          e.event?.level === '重要' ? 'important' : '';
        const levelDisplayMap = {'一般': 'Обычн.', '重要': 'Важное', '关键': 'Ключ.', '摘要': 'Конспект'};
        const levelDisplay = levelDisplayMap[e.event?.level] || e.event?.level || '';
        const levelBadge = e.event?.level ? `<span class="horae-level-badge ${levelClass}">${levelDisplay}</span>` : '';
        
        const dateStr = e.timestamp?.story_date || '?';
        const parsed = parseStoryDate(dateStr);
        const displayDate = (parsed && parsed.type === 'standard') ? formatStoryDate(parsed, true) : dateStr;
        
        const eventKey = `${e.messageIndex}-${e.eventIndex || 0}`;
        const isSelected = selectedTimelineEvents.has(eventKey);
        const selectedClass = isSelected ? 'selected' : '';
        const checkboxDisplay = timelineMultiSelectMode ? 'flex' : 'none';
        
        // Событие помечено как сжатое, но сводка inactive — отображается пунктирной рамкой
        const isRestoredFromCompress = compressedBy && !activeSummaryIds.has(compressedBy);
        const compressedClass = isRestoredFromCompress ? 'horae-compressed-restored' : '';
        
        if (isSummary) {
            const summaryContent = e.event?.summary || '';
            const summaryDisplay = summaryContent || '<span class="horae-summary-hint">Нажмите «Редактировать» для добавления содержимого сводки.</span>';
            const summaryEntry = summaryId ? summaries.find(s => s.id === summaryId) : null;
            const isActive = summaryEntry?.active;
            const rangeStr = summaryEntry ? `#${summaryEntry.range[0]}-#${summaryEntry.range[1]}` : '';
            // Событие сводки с summaryId имеет кнопки переключения/удаления/редактирования
            const toggleBtns = summaryId ? `
                <div class="horae-summary-actions">
                    <button class="horae-summary-edit-btn" data-summary-id="${summaryId}" data-message-id="${e.messageIndex}" data-event-index="${e.eventIndex || 0}" title="Редактировать содержимое сводки">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="horae-summary-toggle-btn" data-summary-id="${summaryId}" title="${isActive ? 'Переключить на исходную хронологию' : 'Переключить на сводку'}">
                        <i class="fa-solid ${isActive ? 'fa-expand' : 'fa-compress'}"></i>
                    </button>
                    <button class="horae-summary-delete-btn" data-summary-id="${summaryId}" title="Удалить сводку">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>` : '';
            return `
            <div class="horae-timeline-item horae-editable-item summary ${selectedClass}" data-message-id="${e.messageIndex}" data-event-key="${eventKey}" data-summary-id="${summaryId || ''}">
                <div class="horae-item-checkbox" style="display: ${checkboxDisplay}">
                    <input type="checkbox" ${isSelected ? 'checked' : ''}>
                </div>
                <div class="horae-timeline-summary-icon">
                    <i class="fa-solid fa-file-lines"></i>
                </div>
                <div class="horae-timeline-content">
                    <div class="horae-timeline-summary">${levelBadge}${summaryDisplay}</div>
                    <div class="horae-timeline-meta">${rangeStr ? rangeStr + ' · ' : ''}${summaryEntry?.auto ? 'Авто-' : ''}сводка · Сообщение #${e.messageIndex}</div>
                </div>
                ${toggleBtns}
                <button class="horae-item-edit-btn" data-edit-type="event" data-message-id="${e.messageIndex}" data-event-index="${e.eventIndex || 0}" title="Редактировать" style="${timelineMultiSelectMode ? 'display:none' : ''}${!summaryId ? '' : 'display:none'}">
                    <i class="fa-solid fa-pen"></i>
                </button>
            </div>
            `;
        }
        
        const restoreBtn = isRestoredFromCompress ? `
                <button class="horae-summary-toggle-btn horae-btn-inline-toggle" data-summary-id="${compressedBy}" title="Переключить на сводку">
                    <i class="fa-solid fa-compress"></i>
                </button>` : '';
        
        return `
            <div class="horae-timeline-item horae-editable-item ${levelClass} ${selectedClass} ${compressedClass}" data-message-id="${e.messageIndex}" data-event-key="${eventKey}">
                <div class="horae-item-checkbox" style="display: ${checkboxDisplay}">
                    <input type="checkbox" ${isSelected ? 'checked' : ''}>
                </div>
                <div class="horae-timeline-time">
                    <div class="date">${displayDate}</div>
                    <div>${e.timestamp?.story_time || ''}</div>
                </div>
                <div class="horae-timeline-content">
                    <div class="horae-timeline-summary">${levelBadge}${e.event?.summary || 'Не записано'}</div>
                    <div class="horae-timeline-meta">${relTime} · Сообщение #${e.messageIndex}</div>
                </div>
                ${restoreBtn}
                <button class="horae-item-edit-btn" data-edit-type="event" data-message-id="${e.messageIndex}" data-event-index="${e.eventIndex || 0}" title="Редактировать" style="${timelineMultiSelectMode ? 'display:none' : ''}">
                    <i class="fa-solid fa-pen"></i>
                </button>
            </div>
        `;
    }).join('');
    
    // Привязать события
    listEl.querySelectorAll('.horae-timeline-item').forEach(item => {
        const eventKey = item.dataset.eventKey;
        
        if (timelineMultiSelectMode) {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (eventKey) toggleTimelineSelection(eventKey);
            });
        } else {
            item.addEventListener('click', (e) => {
                if (_timelineLongPressFired) { _timelineLongPressFired = false; return; }
                if (e.target.closest('.horae-item-edit-btn') || e.target.closest('.horae-summary-actions')) return;
                scrollToMessage(item.dataset.messageId);
            });
            item.addEventListener('mousedown', (e) => startTimelineLongPress(e, eventKey));
            item.addEventListener('touchstart', (e) => startTimelineLongPress(e, eventKey), { passive: false });
            item.addEventListener('mouseup', cancelTimelineLongPress);
            item.addEventListener('mouseleave', cancelTimelineLongPress);
            item.addEventListener('touchend', cancelTimelineLongPress);
            item.addEventListener('touchmove', cancelTimelineLongPress, { passive: true });
            item.addEventListener('touchcancel', cancelTimelineLongPress);
        }
    });
    
    // Кнопки переключения/удаления сводки
    listEl.querySelectorAll('.horae-summary-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSummaryActive(btn.dataset.summaryId);
        });
    });
    listEl.querySelectorAll('.horae-summary-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSummary(btn.dataset.summaryId);
        });
    });
    listEl.querySelectorAll('.horae-summary-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSummaryEditModal(btn.dataset.summaryId, parseInt(btn.dataset.messageId), parseInt(btn.dataset.eventIndex));
        });
    });
    
    bindEditButtons();
}

/** Пакетно скрыть/показать сообщения чата (вызывает нативные команды SillyTavern /hide /unhide) */
async function setMessagesHidden(chat, indices, hidden) {
    if (!indices?.length) return;

    // Предустановить состояние в памяти: сначала записать is_hidden, чтобы предотвратить перезапись при гонке saveChat
    for (const idx of indices) {
        if (chat[idx]) chat[idx].is_hidden = hidden;
    }

    try {
        const slashModule = await import('/scripts/slash-commands.js');
        const exec = slashModule.executeSlashCommandsWithOptions;
        const cmd = hidden ? '/hide' : '/unhide';
        for (const idx of indices) {
            if (!chat[idx]) continue;
            try {
                await exec(`${cmd} ${idx}`);
            } catch (cmdErr) {
                console.warn(`[Horae] ${cmd} ${idx} ошибка:`, cmdErr);
            }
        }
    } catch (e) {
        console.warn('[Horae] Не удалось загрузить модуль команд SillyTavern, переход к ручной установке:', e);
    }

    // Пост-верификация + синхронизация DOM + принудительное сохранение (не зависит от успеха /hide)
    for (const idx of indices) {
        if (!chat[idx]) continue;
        chat[idx].is_hidden = hidden;
        const $el = $(`.mes[mesid="${idx}"]`);
        if (hidden) $el.attr('is_hidden', 'true');
        else $el.removeAttr('is_hidden');
    }
    await getContext().saveChat();
}

/** Получить все связанные индексы сообщений из записи сводки */
function getSummaryMsgIndices(entry) {
    if (!entry) return [];
    const fromEvents = (entry.originalEvents || []).map(e => e.msgIdx);
    if (entry.range) {
        for (let i = entry.range[0]; i <= entry.range[1]; i++) fromEvents.push(i);
    }
    return [...new Set(fromEvents)];
}

/** Переключить состояние active сводки (вид сводки ↔ исходная хронология) */
async function toggleSummaryActive(summaryId) {
    if (!summaryId) return;
    const chat = horaeManager.getChat();
    const sums = chat?.[0]?.horae_meta?.autoSummaries;
    if (!sums) return;
    const entry = sums.find(s => s.id === summaryId);
    if (!entry) return;
    entry.active = !entry.active;
    // Синхронизировать видимость сообщений: active=режим сводки→скрыть оригиналы, inactive=исходный режим→показать оригиналы
    const indices = getSummaryMsgIndices(entry);
    await setMessagesHidden(chat, indices, entry.active);
    await getContext().saveChat();
    updateTimelineDisplay();
}

/** Удалить сводку и восстановить метки сжатия исходных событий */
async function deleteSummary(summaryId) {
    if (!summaryId) return;
    if (!confirm('Удалить эту сводку? Исходные события будут восстановлены в обычную хронологию.')) return;
    
    const chat = horaeManager.getChat();
    const firstMeta = chat?.[0]?.horae_meta;
    
    // Удалить запись из autoSummaries (если есть)
    let removedEntry = null;
    if (firstMeta?.autoSummaries) {
        const idx = firstMeta.autoSummaries.findIndex(s => s.id === summaryId);
        if (idx !== -1) {
            removedEntry = firstMeta.autoSummaries.splice(idx, 1)[0];
        }
    }
    
    // Очистить соответствующие метки _compressedBy и события сводки во всех сообщениях (независимо от наличия записи в autoSummaries)
    for (let i = 0; i < chat.length; i++) {
        const meta = chat[i]?.horae_meta;
        if (!meta?.events) continue;
        meta.events = meta.events.filter(evt => evt._summaryId !== summaryId);
        for (const evt of meta.events) {
            if (evt._compressedBy === summaryId) delete evt._compressedBy;
        }
    }
    
    // Восстановить скрытые сообщения
    if (removedEntry) {
        const indices = getSummaryMsgIndices(removedEntry);
        await setMessagesHidden(chat, indices, false);
    }
    
    await getContext().saveChat();
    updateTimelineDisplay();
    showToast('Сводка удалена, исходные события восстановлены', 'success');
}

/** Открыть окно редактирования сводки для ручного изменения содержимого */
function openSummaryEditModal(summaryId, messageId, eventIndex) {
    closeEditModal();
    const chat = horaeManager.getChat();
    const firstMeta = chat?.[0]?.horae_meta;
    const summaryEntry = firstMeta?.autoSummaries?.find(s => s.id === summaryId);
    const meta = chat[messageId]?.horae_meta;
    const evtsArr = meta?.events || [];
    const evt = evtsArr[eventIndex];
    if (!evt) { showToast('Событие сводки не найдено', 'error'); return; }
    const currentText = evt.summary || '';

    const modalHtml = `
        <div id="horae-edit-modal" class="horae-modal${isLightMode() ? ' horae-light' : ''}">
            <div class="horae-modal-content">
                <div class="horae-modal-header">
                    <i class="fa-solid fa-pen"></i> Редактировать сводку
                </div>
                <div class="horae-modal-body horae-edit-modal-body">
                    <div class="horae-edit-field">
                        <label>Содержимое сводки</label>
                        <textarea id="horae-summary-edit-text" rows="10" style="width:100%;min-height:180px;font-size:13px;line-height:1.6;">${escapeHtml(currentText)}</textarea>
                    </div>
                </div>
                <div class="horae-modal-footer">
                    <button id="horae-summary-edit-save" class="horae-btn primary">
                        <i class="fa-solid fa-check"></i> Сохранить
                    </button>
                    <button id="horae-summary-edit-cancel" class="horae-btn">
                        <i class="fa-solid fa-xmark"></i> Отмена
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    preventModalBubble();

    document.getElementById('horae-edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'horae-edit-modal') closeEditModal();
    });

    document.getElementById('horae-summary-edit-save').addEventListener('click', async (e) => {
        e.stopPropagation();
        const newText = document.getElementById('horae-summary-edit-text').value.trim();
        if (!newText) { showToast('Содержимое сводки не может быть пустым', 'warning'); return; }
        evt.summary = newText;
        if (summaryEntry) summaryEntry.summaryText = newText;
        await getContext().saveChat();
        closeEditModal();
        updateTimelineDisplay();
        showToast('Сводка обновлена', 'success');
    });

    document.getElementById('horae-summary-edit-cancel').addEventListener('click', () => closeEditModal());
}

/**
 * Обновить отображение задач
 */
function updateAgendaDisplay() {
    const listEl = document.getElementById('horae-agenda-list');
    if (!listEl) return;
    
    const agenda = getAllAgenda();
    
    if (agenda.length === 0) {
        listEl.innerHTML = '<div class="horae-empty-hint">Нет задач</div>';
        // Выйти из режима множественного выбора (если все задачи удалены)
        if (agendaMultiSelectMode) exitAgendaMultiSelect();
        return;
    }
    
    listEl.innerHTML = agenda.map((item, index) => {
        const sourceIcon = item.source === 'ai'
            ? '<i class="fa-solid fa-robot horae-agenda-source-ai" title="Записано ИИ"></i>'
            : '<i class="fa-solid fa-user horae-agenda-source-user" title="Добавлено пользователем"></i>';
        const dateDisplay = item.date ? `<span class="horae-agenda-date"><i class="fa-regular fa-calendar"></i> ${escapeHtml(item.date)}</span>` : '';
        
        // Режим множественного выбора: показать checkbox
        const checkboxHtml = agendaMultiSelectMode
            ? `<label class="horae-agenda-select-check"><input type="checkbox" ${selectedAgendaIndices.has(index) ? 'checked' : ''} data-agenda-select="${index}"></label>`
            : '';
        const selectedClass = agendaMultiSelectMode && selectedAgendaIndices.has(index) ? ' selected' : '';
        
        return `
            <div class="horae-agenda-item${selectedClass}" data-agenda-idx="${index}">
                ${checkboxHtml}
                <div class="horae-agenda-body">
                    <div class="horae-agenda-meta">${sourceIcon}${dateDisplay}</div>
                    <div class="horae-agenda-text">${escapeHtml(item.text)}</div>
                </div>
            </div>
        `;
    }).join('');
    
    const currentAgenda = agenda;
    
    listEl.querySelectorAll('.horae-agenda-item').forEach(el => {
        const idx = parseInt(el.dataset.agendaIdx);
        
        if (agendaMultiSelectMode) {
            // Режим множественного выбора: клик переключает выбор
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleAgendaSelection(idx);
            });
        } else {
            // Обычный режим: клик для редактирования, долгое нажатие для входа в режим выбора
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = currentAgenda[idx];
                if (item) openAgendaEditModal(item);
            });
            
            // Долгое нажатие для входа в режим множественного выбора（только для элементов agenda)
            el.addEventListener('mousedown', (e) => startAgendaLongPress(e, idx));
            el.addEventListener('touchstart', (e) => startAgendaLongPress(e, idx), { passive: true });
            el.addEventListener('mouseup', cancelAgendaLongPress);
            el.addEventListener('mouseleave', cancelAgendaLongPress);
            el.addEventListener('touchmove', cancelAgendaLongPress, { passive: true });
            el.addEventListener('touchend', cancelAgendaLongPress);
            el.addEventListener('touchcancel', cancelAgendaLongPress);
        }
    });
}

// ---- Режим множественного выбора задач ----

function startAgendaLongPress(e, agendaIdx) {
    if (agendaMultiSelectMode) return;
    agendaLongPressTimer = setTimeout(() => {
        enterAgendaMultiSelect(agendaIdx);
    }, 800);
}

function cancelAgendaLongPress() {
    if (agendaLongPressTimer) {
        clearTimeout(agendaLongPressTimer);
        agendaLongPressTimer = null;
    }
}

function enterAgendaMultiSelect(initialIdx) {
    agendaMultiSelectMode = true;
    selectedAgendaIndices.clear();
    if (initialIdx !== undefined && initialIdx !== null) {
        selectedAgendaIndices.add(initialIdx);
    }
    
    const bar = document.getElementById('horae-agenda-multiselect-bar');
    if (bar) bar.style.display = 'flex';
    
    // Скрыть кнопку добавления
    const addBtn = document.getElementById('horae-btn-add-agenda');
    if (addBtn) addBtn.style.display = 'none';
    
    updateAgendaDisplay();
    updateAgendaSelectedCount();
    showToast('Режим множественного выбора активирован. Нажмите для выбора задач', 'info');
}

function exitAgendaMultiSelect() {
    agendaMultiSelectMode = false;
    selectedAgendaIndices.clear();
    
    const bar = document.getElementById('horae-agenda-multiselect-bar');
    if (bar) bar.style.display = 'none';
    
    // Восстановить кнопку добавления
    const addBtn = document.getElementById('horae-btn-add-agenda');
    if (addBtn) addBtn.style.display = '';
    
    updateAgendaDisplay();
}

function toggleAgendaSelection(idx) {
    if (selectedAgendaIndices.has(idx)) {
        selectedAgendaIndices.delete(idx);
    } else {
        selectedAgendaIndices.add(idx);
    }
    
    // Обновить UI этого элемента
    const item = document.querySelector(`#horae-agenda-list .horae-agenda-item[data-agenda-idx="${idx}"]`);
    if (item) {
        const cb = item.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = selectedAgendaIndices.has(idx);
        item.classList.toggle('selected', selectedAgendaIndices.has(idx));
    }
    
    updateAgendaSelectedCount();
}

function selectAllAgenda() {
    const items = document.querySelectorAll('#horae-agenda-list .horae-agenda-item');
    items.forEach(item => {
        const idx = parseInt(item.dataset.agendaIdx);
        if (!isNaN(idx)) selectedAgendaIndices.add(idx);
    });
    updateAgendaDisplay();
    updateAgendaSelectedCount();
}

function updateAgendaSelectedCount() {
    const countEl = document.getElementById('horae-agenda-selected-count');
    if (countEl) countEl.textContent = selectedAgendaIndices.size;
}

async function deleteSelectedAgenda() {
    if (selectedAgendaIndices.size === 0) {
        showToast('Не выбрано ни одной задачи', 'warning');
        return;
    }
    
    const confirmed = confirm(`Удалить выбранные ${selectedAgendaIndices.size} задач(у/и)? Это действие необратимо.`);
    if (!confirmed) return;
    
    // Получить полный список задач, удалять в обратном порядке по индексам
    const agenda = getAllAgenda();
    const sortedIndices = Array.from(selectedAgendaIndices).sort((a, b) => b - a);
    
    for (const idx of sortedIndices) {
        const item = agenda[idx];
        if (item) {
            deleteAgendaItem(item);
        }
    }
    
    await getContext().saveChat();
    showToast(`Удалено ${selectedAgendaIndices.size} задач(а/и)`, 'success');
    
    exitAgendaMultiSelect();
}

// ============================================
// Режим множественного выбора хронологии & контекстное меню по долгому нажатию
// ============================================

/** Начало долгого нажатия на хронологию (показывает меню вставки) */
let _timelineLongPressFired = false;
function startTimelineLongPress(e, eventKey) {
    if (timelineMultiSelectMode) return;
    _timelineLongPressFired = false;
    timelineLongPressTimer = setTimeout(() => {
        _timelineLongPressFired = true;
        e.preventDefault?.();
        showTimelineContextMenu(e, eventKey);
    }, 800);
}

/** Отменить долгое нажатие на хронологии */
function cancelTimelineLongPress() {
    if (timelineLongPressTimer) {
        clearTimeout(timelineLongPressTimer);
        timelineLongPressTimer = null;
    }
}

/** Показать контекстное меню долгого нажатия хронологии */
function showTimelineContextMenu(e, eventKey) {
    closeTimelineContextMenu();
    const [msgIdx, evtIdx] = eventKey.split('-').map(Number);
    
    const menu = document.createElement('div');
    menu.id = 'horae-timeline-context-menu';
    menu.className = 'horae-context-menu';
    menu.innerHTML = `
        <div class="horae-context-item" data-action="insert-event-above">
            <i class="fa-solid fa-arrow-up"></i> Добавить событие выше
        </div>
        <div class="horae-context-item" data-action="insert-event-below">
            <i class="fa-solid fa-arrow-down"></i> Добавить событие ниже
        </div>
        <div class="horae-context-separator"></div>
        <div class="horae-context-item" data-action="insert-summary-above">
            <i class="fa-solid fa-file-lines"></i> Вставить сводку выше
        </div>
        <div class="horae-context-item" data-action="insert-summary-below">
            <i class="fa-solid fa-file-lines"></i> Вставить сводку ниже
        </div>
        <div class="horae-context-separator"></div>
        <div class="horae-context-item danger" data-action="delete">
            <i class="fa-solid fa-trash-can"></i> Удалить событие
        </div>
    `;
    
    document.body.appendChild(menu);
    
    // Предотвратить всплытие событий самого меню (чтобы ящик не закрывался на мобильных)
    ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach(evType => {
        menu.addEventListener(evType, (ev) => ev.stopPropagation());
    });
    
    // Позиционирование
    const rect = e.target.closest('.horae-timeline-item')?.getBoundingClientRect();
    if (rect) {
        let top = rect.bottom + 4;
        let left = rect.left + rect.width / 2 - 90;
        if (top + menu.offsetHeight > window.innerHeight) top = rect.top - menu.offsetHeight - 4;
        if (left < 8) left = 8;
        if (left + 180 > window.innerWidth) left = window.innerWidth - 188;
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
    } else {
        menu.style.top = `${(e.clientY || e.touches?.[0]?.clientY || 100)}px`;
        menu.style.left = `${(e.clientX || e.touches?.[0]?.clientX || 100)}px`;
    }
    
    // Привязать действия пунктов меню (двойная привязка click + touchend для поддержки мобильных)
    menu.querySelectorAll('.horae-context-item').forEach(item => {
        let handled = false;
        const handler = (ev) => {
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            ev.preventDefault();
            if (handled) return;
            handled = true;
            const action = item.dataset.action;
            closeTimelineContextMenu();
            handleTimelineContextAction(action, msgIdx, evtIdx, eventKey);
        };
        item.addEventListener('click', handler);
        item.addEventListener('touchend', handler);
    });
    
    // Клик вне меню закрывает его (только click, не touchstart, чтобы не перехватывать мобильные касания)
    setTimeout(() => {
        const dismissHandler = (ev) => {
            if (menu.contains(ev.target)) return;
            closeTimelineContextMenu();
            document.removeEventListener('click', dismissHandler, true);
        };
        document.addEventListener('click', dismissHandler, true);
    }, 100);
}

/** Закрыть контекстное меню хронологии */
function closeTimelineContextMenu() {
    const menu = document.getElementById('horae-timeline-context-menu');
    if (menu) menu.remove();
}

/** Обработать действие контекстного меню хронологии */
async function handleTimelineContextAction(action, msgIdx, evtIdx, eventKey) {
    const chat = horaeManager.getChat();
    
    if (action === 'delete') {
        if (!confirm('Удалить это событие?')) return;
        const meta = chat[msgIdx]?.horae_meta;
        if (!meta) return;
        if (meta.events && evtIdx < meta.events.length) {
            meta.events.splice(evtIdx, 1);
        } else if (meta.event && evtIdx === 0) {
            delete meta.event;
        }
        await getContext().saveChat();
        showToast('Событие удалено', 'success');
        updateTimelineDisplay();
        updateStatusDisplay();
        return;
    }
    
    const isAbove = action.includes('above');
    const isSummary = action.includes('summary');
    
    if (isSummary) {
        openTimelineSummaryModal(msgIdx, evtIdx, isAbove);
    } else {
        openTimelineInsertEventModal(msgIdx, evtIdx, isAbove);
    }
}

/** Открыть окно вставки события */
function openTimelineInsertEventModal(refMsgIdx, refEvtIdx, isAbove) {
    const state = horaeManager.getLatestState();
    const currentDate = state.timestamp?.story_date || '';
    const currentTime = state.timestamp?.story_time || '';
    
    const modalHtml = `
        <div id="horae-edit-modal" class="horae-modal">
            <div class="horae-modal-content">
                <div class="horae-modal-header">
                    <i class="fa-solid fa-timeline"></i> ${isAbove ? 'выше' : 'ниже'} добавить событие
                </div>
                <div class="horae-modal-body horae-edit-modal-body">
                    <div class="horae-edit-field">
                        <label>Дата</label>
                        <input type="text" id="insert-event-date" value="${currentDate}" placeholder="Например 2026/2/14">
                    </div>
                    <div class="horae-edit-field">
                        <label>Время</label>
                        <input type="text" id="insert-event-time" value="${currentTime}" placeholder="Например 15:00">
                    </div>
                    <div class="horae-edit-field">
                        <label>Уровень важности</label>
                        <select id="insert-event-level" class="horae-select">
                            <option value="一般">Обычное</option>
                            <option value="重要">Важное</option>
                            <option value="关键">Ключевое</option>
                        </select>
                    </div>
                    <div class="horae-edit-field">
                        <label>Краткое описание события</label>
                        <textarea id="insert-event-summary" rows="3" placeholder="Опишите событие кратко..."></textarea>
                    </div>
                </div>
                <div class="horae-modal-footer">
                    <button id="edit-modal-save" class="horae-btn primary">
                        <i class="fa-solid fa-check"></i> Добавить
                    </button>
                    <button id="edit-modal-cancel" class="horae-btn">
                        <i class="fa-solid fa-xmark"></i> Отмена
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    preventModalBubble();
    
    document.getElementById('edit-modal-save').addEventListener('click', async (e) => {
        e.stopPropagation();
        const date = document.getElementById('insert-event-date').value.trim();
        const time = document.getElementById('insert-event-time').value.trim();
        const level = document.getElementById('insert-event-level').value;
        const summary = document.getElementById('insert-event-summary').value.trim();
        
        if (!summary) { showToast('Введите краткое описание события', 'warning'); return; }
        
        const newEvent = {
            is_important: level === '重要' || level === '关键',
            level: level,
            summary: summary
        };
        
        const chat = horaeManager.getChat();
        const meta = chat[refMsgIdx]?.horae_meta;
        if (!meta) { closeEditModal(); return; }
        if (!meta.events) meta.events = [];
        
        const newTimestamp = { story_date: date, story_time: time };
        if (!meta.timestamp) meta.timestamp = {};
        
        const insertIdx = isAbove ? refEvtIdx + 1 : refEvtIdx;
        meta.events.splice(insertIdx, 0, newEvent);
        
        if (date && !meta.timestamp.story_date) {
            meta.timestamp.story_date = date;
            meta.timestamp.story_time = time;
        }
        
        await getContext().saveChat();
        closeEditModal();
        updateTimelineDisplay();
        updateStatusDisplay();
        showToast('Событие добавлено', 'success');
    });
    
    document.getElementById('edit-modal-cancel').addEventListener('click', (e) => {
        e.stopPropagation();
        closeEditModal();
    });
}

/** Открыть окно вставки сводки */
function openTimelineSummaryModal(refMsgIdx, refEvtIdx, isAbove) {
    const modalHtml = `
        <div id="horae-edit-modal" class="horae-modal">
            <div class="horae-modal-content">
                <div class="horae-modal-header">
                    <i class="fa-solid fa-file-lines"></i> ${isAbove ? 'выше' : 'ниже'} вставить сводку
                </div>
                <div class="horae-modal-body horae-edit-modal-body">
                    <div class="horae-edit-field">
                        <label>Содержимое сводки</label>
                        <textarea id="insert-summary-text" rows="5" placeholder="Введите содержимое сводки, заменяющей удалённые события хронологии...&#10;&#10;Подсказка: не удаляй хронологию в начале, иначе расчёт относительного времени и автоматическое вычисление возраста перестанут работать."></textarea>
                    </div>
                </div>
                <div class="horae-modal-footer">
                    <button id="edit-modal-save" class="horae-btn primary">
                        <i class="fa-solid fa-check"></i> Вставить сводку
                    </button>
                    <button id="edit-modal-cancel" class="horae-btn">
                        <i class="fa-solid fa-xmark"></i> Отмена
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    preventModalBubble();
    
    document.getElementById('edit-modal-save').addEventListener('click', async (e) => {
        e.stopPropagation();
        const summaryText = document.getElementById('insert-summary-text').value.trim();
        if (!summaryText) { showToast('Введите содержимое сводки', 'warning'); return; }
        
        const newEvent = {
            is_important: true,
            level: '摘要',
            summary: summaryText,
            isSummary: true
        };
        
        const chat = horaeManager.getChat();
        const meta = chat[refMsgIdx]?.horae_meta;
        if (!meta) { closeEditModal(); return; }
        if (!meta.events) meta.events = [];
        
        const insertIdx = isAbove ? refEvtIdx + 1 : refEvtIdx;
        meta.events.splice(insertIdx, 0, newEvent);
        
        await getContext().saveChat();
        closeEditModal();
        updateTimelineDisplay();
        updateStatusDisplay();
        showToast('Сводка вставлена', 'success');
    });
    
    document.getElementById('edit-modal-cancel').addEventListener('click', (e) => {
        e.stopPropagation();
        closeEditModal();
    });
}

/** Войти в режим множественного выбора хронологии */
function enterTimelineMultiSelect(initialKey) {
    timelineMultiSelectMode = true;
    selectedTimelineEvents.clear();
    if (initialKey) selectedTimelineEvents.add(initialKey);
    
    const bar = document.getElementById('horae-timeline-multiselect-bar');
    if (bar) bar.style.display = 'flex';
    
    updateTimelineDisplay();
    updateTimelineSelectedCount();
    showToast('Режим множественного выбора активирован. Нажмите для выбора событий', 'info');
}

/** Выйти из режима множественного выбора хронологии */
function exitTimelineMultiSelect() {
    timelineMultiSelectMode = false;
    selectedTimelineEvents.clear();
    
    const bar = document.getElementById('horae-timeline-multiselect-bar');
    if (bar) bar.style.display = 'none';
    
    updateTimelineDisplay();
}

/** Переключить состояние выбора события хронологии */
function toggleTimelineSelection(eventKey) {
    if (selectedTimelineEvents.has(eventKey)) {
        selectedTimelineEvents.delete(eventKey);
    } else {
        selectedTimelineEvents.add(eventKey);
    }
    
    const item = document.querySelector(`.horae-timeline-item[data-event-key="${eventKey}"]`);
    if (item) {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = selectedTimelineEvents.has(eventKey);
        item.classList.toggle('selected', selectedTimelineEvents.has(eventKey));
    }
    updateTimelineSelectedCount();
}

/** Выбрать все события хронологии */
function selectAllTimelineEvents() {
    document.querySelectorAll('#horae-timeline-list .horae-timeline-item').forEach(item => {
        const key = item.dataset.eventKey;
        if (key) selectedTimelineEvents.add(key);
    });
    updateTimelineDisplay();
    updateTimelineSelectedCount();
}

/** Обновить счётчик выбранных событий хронологии */
function updateTimelineSelectedCount() {
    const el = document.getElementById('horae-timeline-selected-count');
    if (el) el.textContent = selectedTimelineEvents.size;
}

/** Окно выбора режима сжатия */
function showCompressModeDialog(eventCount, msgRange) {
    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'horae-modal' + (isLightMode() ? ' horae-light' : '');
        modal.innerHTML = `
            <div class="horae-modal-content" style="max-width: 420px;">
                <div class="horae-modal-header"><span>Режим сжатия</span></div>
                <div class="horae-modal-body" style="padding: 16px;">
                    <p style="margin: 0 0 12px; color: var(--horae-text-muted); font-size: 13px;">
                        Выбрано <strong style="color: var(--horae-primary-light);">${eventCount}</strong> событий,
                        охватывают сообщения #${msgRange[0]} – #${msgRange[1]}
                    </p>
                    <label style="display: flex; align-items: flex-start; gap: 8px; padding: 10px; border: 1px solid var(--horae-border); border-radius: 6px; cursor: pointer; margin-bottom: 8px;">
                        <input type="radio" name="horae-compress-mode" value="event" checked style="margin-top: 3px;">
                        <div>
                            <div style="font-size: 13px; color: var(--horae-text); font-weight: 500;">Сжатие событий</div>
                            <div style="font-size: 11px; color: var(--horae-text-muted); margin-top: 2px;">Сжатие из извлечённого текста сводок событий (быстро, только данные из хронологии)</div>
                        </div>
                    </label>
                    <label style="display: flex; align-items: flex-start; gap: 8px; padding: 10px; border: 1px solid var(--horae-border); border-radius: 6px; cursor: pointer;">
                        <input type="radio" name="horae-compress-mode" value="fulltext" style="margin-top: 3px;">
                        <div>
                            <div style="font-size: 13px; color: var(--horae-text); font-weight: 500;">Полнотекстовая сводка</div>
                            <div style="font-size: 11px; color: var(--horae-text-muted); margin-top: 2px;">Перечитать полный текст сообщений с выбранными событиями (больше деталей, но расходует больше токенов)</div>
                        </div>
                    </label>
                </div>
                <div class="horae-modal-footer">
                    <button class="horae-btn" id="horae-compress-cancel">Отмена</button>
                    <button class="horae-btn primary" id="horae-compress-confirm">Продолжить</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#horae-compress-confirm').addEventListener('click', () => {
            const mode = modal.querySelector('input[name="horae-compress-mode"]:checked').value;
            modal.remove();
            resolve(mode);
        });
        modal.querySelector('#horae-compress-cancel').addEventListener('click', () => { modal.remove(); resolve(null); });
        modal.addEventListener('click', e => { if (e.target === modal) { modal.remove(); resolve(null); } });
    });
}

/** ИИ: умное сжатие выбранных событий хронологии в одну сводку */
async function compressSelectedTimelineEvents() {
    if (selectedTimelineEvents.size < 2) {
        showToast('Выберите не менее 2 событий для сжатия', 'warning');
        return;
    }
    
    const chat = horaeManager.getChat();
    const events = [];
    for (const key of selectedTimelineEvents) {
        const [msgIdx, evtIdx] = key.split('-').map(Number);
        const meta = chat[msgIdx]?.horae_meta;
        if (!meta) continue;
        const evtsArr = meta.events || (meta.event ? [meta.event] : []);
        const evt = evtsArr[evtIdx];
        if (!evt) continue;
        const date = meta.timestamp?.story_date || '?';
        const time = meta.timestamp?.story_time || '';
        events.push({
            key, msgIdx, evtIdx,
            date, time,
            level: evt.level || '一般',
            summary: evt.summary || '',
            isSummary: evt.isSummary || evt.level === '摘要'
        });
    }
    
    if (events.length < 2) {
        showToast('Недостаточно действительных событий (менее 2)', 'warning');
        return;
    }
    
    events.sort((a, b) => a.msgIdx - b.msgIdx || a.evtIdx - b.evtIdx);
    
    const msgRange = [events[0].msgIdx, events[events.length - 1].msgIdx];
    const mode = await showCompressModeDialog(events.length, msgRange);
    if (!mode) return;
    
    let sourceText;
    if (mode === 'fulltext') {
        // Собрать полные тексты затронутых сообщений
        const msgIndices = [...new Set(events.map(e => e.msgIdx))].sort((a, b) => a - b);
        const fullTexts = msgIndices.map(idx => {
            const msg = chat[idx];
            const date = msg?.horae_meta?.timestamp?.story_date || '';
            const time = msg?.horae_meta?.timestamp?.story_time || '';
            const timeStr = [date, time].filter(Boolean).join(' ');
            return `【#${idx}${timeStr ? ' ' + timeStr : ''}】\n${msg?.mes || ''}`;
        });
        sourceText = fullTexts.join('\n\n');
    } else {
        sourceText = events.map(e => {
            const timeStr = e.time ? `${e.date} ${e.time}` : e.date;
            return `[${e.level}] ${timeStr}: ${e.summary}`;
        }).join('\n');
    }
    
    let cancelled = false;
    let cancelResolve = null;
    const cancelPromise = new Promise(resolve => { cancelResolve = resolve; });

    const fetchAbort = new AbortController();
    const _origFetch = window.fetch;
    window.fetch = function(input, init = {}) {
        if (!cancelled) {
            const ourSignal = fetchAbort.signal;
            if (init.signal && typeof AbortSignal.any === 'function') {
                init.signal = AbortSignal.any([init.signal, ourSignal]);
            } else {
                init.signal = ourSignal;
            }
        }
        return _origFetch.call(this, input, init);
    };

    const overlay = document.createElement('div');
    overlay.className = 'horae-progress-overlay' + (isLightMode() ? ' horae-light' : '');
    overlay.innerHTML = `
        <div class="horae-progress-container">
            <div class="horae-progress-title">ИИ: сжатие...</div>
            <div class="horae-progress-bar"><div class="horae-progress-fill" style="width: 50%"></div></div>
            <div class="horae-progress-text">${mode === 'fulltext' ? 'Перечитываю полный текст для создания сводки...' : 'Создаю сводку...'}</div>
            <button class="horae-progress-cancel"><i class="fa-solid fa-xmark"></i> Отменить сжатие</button>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.horae-progress-cancel').addEventListener('click', () => {
        if (cancelled) return;
        if (!confirm('После отмены сводка не будет сохранена. Отменить?')) return;
        cancelled = true;
        fetchAbort.abort();
        try { getContext().stopGeneration(); } catch (_) {}
        cancelResolve();
        overlay.remove();
        window.fetch = _origFetch;
        showToast('Сжатие отменено', 'info');
    });
    
    try {
        const context = getContext();
        const userName = context?.name1 || 'Главный герой';
        const eventText = events.map(e => {
            const timeStr = e.time ? `${e.date} ${e.time}` : e.date;
            return `[${e.level}] ${timeStr}: ${e.summary}`;
        }).join('\n');

        const fullTemplate = settings.customCompressPrompt || getDefaultCompressPrompt();
        const section = parseCompressPrompt(fullTemplate, mode);
        const prompt = section
            .replace(/\{\{events\}\}/gi, mode === 'event' ? sourceText : eventText)
            .replace(/\{\{fulltext\}\}/gi, mode === 'fulltext' ? sourceText : '')
            .replace(/\{\{count\}\}/gi, String(events.length))
            .replace(/\{\{user\}\}/gi, userName);

        _isSummaryGeneration = true;
        let response;
        try {
            const genPromise = getContext().generateRaw(prompt, null, false, false);
            response = await Promise.race([genPromise, cancelPromise]);
        } finally {
            _isSummaryGeneration = false;
            window.fetch = _origFetch;
        }
        
        if (cancelled) return;
        
        if (!response || !response.trim()) {
            overlay.remove();
            showToast('ИИ не вернул действительную сводку', 'warning');
            return;
        }
        
        const summaryText = response.trim();
        
        // Неразрушающее сжатие: сохранить исходные события и сводку в autoSummaries
        const firstMsg = chat[0];
        if (!firstMsg.horae_meta) firstMsg.horae_meta = createEmptyMeta();
        if (!firstMsg.horae_meta.autoSummaries) firstMsg.horae_meta.autoSummaries = [];
        
        // Собрать резервную копию исходных сжатых событий
        const originalEvents = events.map(e => ({
            msgIdx: e.msgIdx,
            evtIdx: e.evtIdx,
            event: { ...chat[e.msgIdx]?.horae_meta?.events?.[e.evtIdx] },
            timestamp: chat[e.msgIdx]?.horae_meta?.timestamp
        }));
        
        const summaryId = `cs_${Date.now()}`;
        const summaryEntry = {
            id: summaryId,
            range: [events[0].msgIdx, events[events.length - 1].msgIdx],
            summaryText,
            originalEvents,
            active: true,
            createdAt: new Date().toISOString(),
            auto: false
        };
        firstMsg.horae_meta.autoSummaries.push(summaryEntry);
        
        // Пометить исходные события как сжатые (не удалять), совместимость со старым форматом meta.event
        // Пометить все события во всех затронутых сообщениях, чтобы предотвратить утечку невыбранных событий из того же сообщения
        const compressedMsgIndices = [...new Set(events.map(e => e.msgIdx))];
        for (const msgIdx of compressedMsgIndices) {
            const meta = chat[msgIdx]?.horae_meta;
            if (!meta) continue;
            if (meta.event && !meta.events) {
                meta.events = [meta.event];
                delete meta.event;
            }
            if (!meta.events) continue;
            for (let j = 0; j < meta.events.length; j++) {
                if (meta.events[j] && !meta.events[j].isSummary) {
                    meta.events[j]._compressedBy = summaryId;
                }
            }
        }
        
        // Вставить событие сводки на позицию самого раннего сообщения
        const firstEvent = events[0];
        const firstMeta = chat[firstEvent.msgIdx]?.horae_meta;
        if (firstMeta) {
            if (!firstMeta.events) firstMeta.events = [];
            firstMeta.events.push({
                is_important: true,
                level: '摘要',
                summary: summaryText,
                isSummary: true,
                _summaryId: summaryId
            });
        }
        
        // Скрыть все сообщения в диапазоне (включая промежуточные сообщения пользователя)
        const hideMin = compressedMsgIndices[0];
        const hideMax = compressedMsgIndices[compressedMsgIndices.length - 1];
        const hideIndices = [];
        for (let i = hideMin; i <= hideMax; i++) hideIndices.push(i);
        await setMessagesHidden(chat, hideIndices, true);
        
        await context.saveChat();
        overlay.remove();
        exitTimelineMultiSelect();
        updateTimelineDisplay();
        updateStatusDisplay();
        showToast(`${events.length} событий${mode === 'fulltext' ? ' (режим полного текста)' : ''} сжаты в сводку`, 'success');
    } catch (err) {
        window.fetch = _origFetch;
        overlay.remove();
        if (cancelled || err?.name === 'AbortError') return;
        console.error('[Horae] Ошибка сжатия:', err);
        showToast('Ошибка сжатия ИИ: ' + (err.message || 'Неизвестная ошибка'), 'error');
    }
}

/** Удалить выбранные события хронологии */
async function deleteSelectedTimelineEvents() {
    if (selectedTimelineEvents.size === 0) {
        showToast('Не выбрано ни одного события', 'warning');
        return;
    }
    
    const confirmed = confirm(`Удалить выбранные ${selectedTimelineEvents.size} записей хронологии?\n\nМожно восстановить через кнопку «Отменить» рядом с «Обновить».`);
    if (!confirmed) return;
    
    const chat = horaeManager.getChat();
    
    // Группировать по сообщениям, удалять индексы событий в обратном порядке
    const msgMap = new Map();
    for (const key of selectedTimelineEvents) {
        const [msgIdx, evtIdx] = key.split('-').map(Number);
        if (!msgMap.has(msgIdx)) msgMap.set(msgIdx, []);
        msgMap.get(msgIdx).push(evtIdx);
    }
    
    for (const [msgIdx, evtIndices] of msgMap) {
        const meta = chat[msgIdx]?.horae_meta;
        if (!meta) continue;
        
        if (meta.events && meta.events.length > 0) {
            const sorted = evtIndices.sort((a, b) => b - a);
            for (const ei of sorted) {
                if (ei < meta.events.length) {
                    meta.events.splice(ei, 1);
                }
            }
        } else if (meta.event && evtIndices.includes(0)) {
            delete meta.event;
        }
    }
    
    await getContext().saveChat();
    showToast(`Удалено ${selectedTimelineEvents.size} записей хронологии`, 'success');
    exitTimelineMultiSelect();
    updateStatusDisplay();
}

/**
 * Открыть окно добавления/редактирования задачи
 * @param {Object|null} agendaItem - при редактировании передаётся полный объект agenda, при добавлении — null
 */
function openAgendaEditModal(agendaItem = null) {
    const isEdit = agendaItem !== null;
    const currentText = isEdit ? (agendaItem.text || '') : '';
    const currentDate = isEdit ? (agendaItem.date || '') : '';
    const title = isEdit ? 'Редактировать задачу' : 'Добавить задачу';
    
    closeEditModal();
    
    const deleteBtn = isEdit ? `
                    <button id="agenda-modal-delete" class="horae-btn danger">
                        <i class="fa-solid fa-trash"></i> Удалить
                    </button>` : '';
    
    const modalHtml = `
        <div id="horae-edit-modal" class="horae-modal">
            <div class="horae-modal-content">
                <div class="horae-modal-header">
                    <i class="fa-solid fa-list-check"></i> ${title}
                </div>
                <div class="horae-modal-body horae-edit-modal-body">
                    <div class="horae-edit-field">
                        <label>Дата (необязательно)</label>
                        <input type="text" id="agenda-edit-date" value="${escapeHtml(currentDate)}" placeholder="Например 2026/02/10">
                    </div>
                    <div class="horae-edit-field">
                        <label>Содержимое</label>
                        <textarea id="agenda-edit-text" rows="3" placeholder="Введите задачу. Для относительного времени укажите абсолютную дату, напр.: Алан пригласил Алис на вечер в День святого Валентина (2026/02/14 18:00)">${escapeHtml(currentText)}</textarea>
                    </div>
                </div>
                <div class="horae-modal-footer">
                    <button id="agenda-modal-save" class="horae-btn primary">
                        <i class="fa-solid fa-check"></i> Сохранить
                    </button>
                    <button id="agenda-modal-cancel" class="horae-btn">
                        <i class="fa-solid fa-xmark"></i> Отмена
                    </button>
                    ${deleteBtn}
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    preventModalBubble();
    
    setTimeout(() => {
        const textarea = document.getElementById('agenda-edit-text');
        if (textarea) textarea.focus();
    }, 100);
    
    document.getElementById('horae-edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'horae-edit-modal') closeEditModal();
    });
    
    document.getElementById('agenda-modal-save').addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        const text = document.getElementById('agenda-edit-text').value.trim();
        const date = document.getElementById('agenda-edit-date').value.trim();
        if (!text) {
            showToast('Содержимое не может быть пустым', 'warning');
            return;
        }
        
        if (isEdit) {
            // Редактировать существующий элемент
            const context = getContext();
            if (agendaItem._store === 'user') {
                const agenda = getUserAgenda();
                const found = agenda.find(a => a.text === agendaItem.text);
                if (found) {
                    found.text = text;
                    found.date = date;
                }
                setUserAgenda(agenda);
            } else if (agendaItem._store === 'msg' && context?.chat) {
                const msg = context.chat[agendaItem._msgIndex];
                if (msg?.horae_meta?.agenda) {
                    const found = msg.horae_meta.agenda.find(a => a.text === agendaItem.text);
                    if (found) {
                        found.text = text;
                        found.date = date;
                    }
                    getContext().saveChat();
                }
            }
        } else {
            // Новый элемент
            const agenda = getUserAgenda();
            agenda.push({ text, date, source: 'user', done: false, createdAt: Date.now() });
            setUserAgenda(agenda);
        }
        
        closeEditModal();
        updateAgendaDisplay();
        showToast(isEdit ? 'Задача обновлена' : 'Задача добавлена', 'success');
    });
    
    document.getElementById('agenda-modal-cancel').addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeEditModal();
    });
    
    // Кнопка удаления (только в режиме редактирования)
    const deleteEl = document.getElementById('agenda-modal-delete');
    if (deleteEl && isEdit) {
        deleteEl.addEventListener('click', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            if (!confirm('Удалить эту задачу? Это действие необратимо.')) return;
            
            deleteAgendaItem(agendaItem);
            closeEditModal();
            updateAgendaDisplay();
            showToast('Задача удалена', 'info');
        });
    }
}

/**
 * Обновить отображение страницы персонажей
 */
function updateCharactersDisplay() {
    const state = horaeManager.getLatestState();
    const presentChars = state.scene?.characters_present || [];
    const favoriteNpcs = settings.favoriteNpcs || [];
    
    // Получить имя главного персонажа карточки (для закрепления и специального стиля)
    const context = getContext();
    const mainCharName = context?.name2 || '';
    
    // Присутствующие персонажи
    const presentEl = document.getElementById('horae-present-characters');
    if (presentEl) {
        if (presentChars.length === 0) {
            presentEl.innerHTML = '<div class="horae-empty-hint">Нет записей</div>';
        } else {
            presentEl.innerHTML = presentChars.map(char => {
                const isMainChar = mainCharName && char.includes(mainCharName);
                return `
                    <div class="horae-character-badge ${isMainChar ? 'main-character' : ''}">
                        <i class="fa-solid fa-user"></i>
                        ${char}
                    </div>
                `;
            }).join('');
        }
    }
    
    // Расположение — многоуровневое отображение: важные > присутствующие > остальные
    const affectionEl = document.getElementById('horae-affection-list');
    const pinnedNpcsAff = settings.pinnedNpcs || [];
    if (affectionEl) {
        const entries = Object.entries(state.affection || {});
        if (entries.length === 0) {
            affectionEl.innerHTML = '<div class="horae-empty-hint">Нет записей о расположении</div>';
        } else {
            // Определить, является ли персонаж важным
            const isMainCharAff = (key) => {
                if (pinnedNpcsAff.includes(key)) return true;
                if (mainCharName && key.includes(mainCharName)) return true;
                return false;
            };
            const mainCharAffection = entries.filter(([key]) => isMainCharAff(key));
            const presentAffection = entries.filter(([key]) => 
                !isMainCharAff(key) && presentChars.some(char => key.includes(char))
            );
            const otherAffection = entries.filter(([key]) => 
                !isMainCharAff(key) && !presentChars.some(char => key.includes(char))
            );
            
            const renderAffection = (arr, isMainChar = false) => arr.map(([key, value]) => {
                const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
                const valueClass = numValue > 0 ? 'positive' : numValue < 0 ? 'negative' : 'neutral';
                const level = horaeManager.getAffectionLevel(numValue);
                const mainClass = isMainChar ? 'main-character' : '';
                return `
                    <div class="horae-affection-item horae-editable-item ${mainClass}" data-char="${key}" data-value="${numValue}">
                        ${isMainChar ? '<i class="fa-solid fa-crown main-char-icon"></i>' : ''}
                        <span class="horae-affection-name">${key}</span>
                        <span class="horae-affection-value ${valueClass}">${numValue > 0 ? '+' : ''}${numValue}</span>
                        <span class="horae-affection-level">${level}</span>
                        <button class="horae-item-edit-btn horae-affection-edit-btn" data-edit-type="affection" data-char="${key}" title="Редактировать расположение">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </div>
                `;
            }).join('');
            
            let html = '';
            // Закрепить персонажей карточки вверху
            if (mainCharAffection.length > 0) {
                html += renderAffection(mainCharAffection, true);
            }
            if (presentAffection.length > 0) {
                if (mainCharAffection.length > 0) {
                    html += '<div class="horae-affection-divider"></div>';
                }
                html += renderAffection(presentAffection);
            }
            if (otherAffection.length > 0) {
                if (mainCharAffection.length > 0 || presentAffection.length > 0) {
                    html += '<div class="horae-affection-divider"></div>';
                }
                html += renderAffection(otherAffection);
            }
            affectionEl.innerHTML = html;
        }
    }
    
    // Список NPC — многоуровневое отображение: важные > со звёздочкой > обычные
    const npcEl = document.getElementById('horae-npc-list');
    const pinnedNpcs = settings.pinnedNpcs || [];
    if (npcEl) {
        const entries = Object.entries(state.npcs || {});
        if (entries.length === 0) {
            npcEl.innerHTML = '<div class="horae-empty-hint">Нет записей о персонажах</div>';
        } else {
            // Определить, является ли персонаж важным(главный персонаж карточки или помечен вручную)
            const isMainChar = (name) => {
                if (pinnedNpcs.includes(name)) return true;
                if (mainCharName && name.includes(mainCharName)) return true;
                return false;
            };
            const mainCharEntries = entries.filter(([name]) => isMainChar(name));
            const favoriteEntries = entries.filter(([name]) => 
                !isMainChar(name) && favoriteNpcs.includes(name)
            );
            const normalEntries = entries.filter(([name]) => 
                !isMainChar(name) && !favoriteNpcs.includes(name)
            );
            
            const renderNpc = (name, info, isFavorite, isMainChar = false) => {
                let descHtml = '';
                if (info.appearance || info.personality || info.relationship) {
                    if (info.appearance) descHtml += `<span class="horae-npc-appearance">${info.appearance}</span>`;
                    if (info.personality) descHtml += `<span class="horae-npc-personality">${info.personality}</span>`;
                    if (info.relationship) descHtml += `<span class="horae-npc-relationship">${info.relationship}</span>`;
                } else if (info.description) {
                    descHtml = `<span class="horae-npc-legacy">${info.description}</span>`;
                } else {
                    descHtml = '<span class="horae-npc-legacy">Нет описания</span>';
                }
                
                // Расширенная информация (возраст/раса/профессия)
                const extraTags = [];
                if (info.race) extraTags.push(info.race);
                if (info.age) {
                    const ageResult = horaeManager.calcCurrentAge(info, state.timestamp?.story_date);
                    if (ageResult.changed) {
                        extraTags.push(`<span class="horae-age-calc" title="Исходное: ${ageResult.original} (с учётом течения времени)">${ageResult.display} лет</span>`);
                    } else {
                        extraTags.push(info.age);
                    }
                }
                if (info.job) extraTags.push(info.job);
                if (extraTags.length > 0) {
                    descHtml += `<span class="horae-npc-extras">${extraTags.join(' · ')}</span>`;
                }
                if (info.note) {
                    descHtml += `<span class="horae-npc-note">${info.note}</span>`;
                }
                
                const starClass = isFavorite ? 'favorite' : '';
                const mainClass = isMainChar ? 'main-character' : '';
                const starIcon = isFavorite ? 'fa-solid fa-star' : 'fa-regular fa-star';
                
                // Маппинг иконок пола
                let genderIcon, genderClass;
                if (isMainChar) {
                    genderIcon = 'fa-solid fa-crown';
                    genderClass = 'horae-gender-main';
                } else {
                    const g = (info.gender || '').toLowerCase();
                    if (/^(男|male|m|雄|公|♂)$/.test(g)) {
                        genderIcon = 'fa-solid fa-person';
                        genderClass = 'horae-gender-male';
                    } else if (/^(女|female|f|雌|母|♀)$/.test(g)) {
                        genderIcon = 'fa-solid fa-person-dress';
                        genderClass = 'horae-gender-female';
                    } else {
                        genderIcon = 'fa-solid fa-user';
                        genderClass = 'horae-gender-unknown';
                    }
                }
                
                const isSelected = selectedNpcs.has(name);
                const selectedClass = isSelected ? 'selected' : '';
                const checkboxDisplay = npcMultiSelectMode ? 'flex' : 'none';
                return `
                    <div class="horae-npc-item horae-editable-item ${starClass} ${mainClass} ${selectedClass}" data-npc-name="${name}" data-npc-gender="${info.gender || ''}">
                        <div class="horae-npc-header">
                            <div class="horae-npc-select-cb" style="display:${checkboxDisplay};align-items:center;margin-right:6px;">
                                <input type="checkbox" ${isSelected ? 'checked' : ''}>
                            </div>
                            <div class="horae-npc-name"><i class="${genderIcon} ${genderClass}"></i> ${name}</div>
                            <div class="horae-npc-actions">
                                <button class="horae-item-edit-btn" data-edit-type="npc" data-edit-name="${name}" title="Редактировать" style="opacity:1;position:static;">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                                <button class="horae-npc-star" title="${isFavorite ? 'Убрать звёздочку' : 'Добавить звёздочку'}">
                                    <i class="${starIcon}"></i>
                                </button>
                            </div>
                        </div>
                        <div class="horae-npc-details">${descHtml}</div>
                    </div>
                `;
            };
            
            // Панель фильтрации по полу
            let html = `
                <div class="horae-gender-filter">
                    <button class="horae-gender-btn active" data-filter="all" title="Все">Все</button>
                    <button class="horae-gender-btn" data-filter="male" title="Мужской"><i class="fa-solid fa-person"></i></button>
                    <button class="horae-gender-btn" data-filter="female" title="Женский"><i class="fa-solid fa-person-dress"></i></button>
                    <button class="horae-gender-btn" data-filter="other" title="Другой/Неизвестно"><i class="fa-solid fa-user"></i></button>
                </div>
            `;
            
            // Область персонажей карточки (закреплённые)
            if (mainCharEntries.length > 0) {
                html += '<div class="horae-npc-section main-character-section">';
                html += '<div class="horae-npc-section-title"><i class="fa-solid fa-crown"></i> Главные персонажи</div>';
                html += mainCharEntries.map(([name, info]) => renderNpc(name, info, false, true)).join('');
                html += '</div>';
            }
            
            // Область NPC со звёздочкой
            if (favoriteEntries.length > 0) {
                if (mainCharEntries.length > 0) {
                    html += '<div class="horae-npc-section-divider"></div>';
                }
                html += '<div class="horae-npc-section favorite-section">';
                html += '<div class="horae-npc-section-title"><i class="fa-solid fa-star"></i> NPC со звёздочкой</div>';
                html += favoriteEntries.map(([name, info]) => renderNpc(name, info, true)).join('');
                html += '</div>';
            }
            
            // Область обычных NPC
            if (normalEntries.length > 0) {
                if (mainCharEntries.length > 0 || favoriteEntries.length > 0) {
                    html += '<div class="horae-npc-section-divider"></div>';
                }
                html += '<div class="horae-npc-section">';
                if (mainCharEntries.length > 0 || favoriteEntries.length > 0) {
                    html += '<div class="horae-npc-section-title">Прочие NPC</div>';
                }
                html += normalEntries.map(([name, info]) => renderNpc(name, info, false)).join('');
                html += '</div>';
            }
            
            npcEl.innerHTML = html;
            
            npcEl.querySelectorAll('.horae-npc-star').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const npcItem = btn.closest('.horae-npc-item');
                    const npcName = npcItem.dataset.npcName;
                    toggleNpcFavorite(npcName);
                });
            });
            
            // Клик множественного выбора NPC
            npcEl.querySelectorAll('.horae-npc-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (!npcMultiSelectMode) return;
                    if (e.target.closest('.horae-item-edit-btn') || e.target.closest('.horae-npc-star')) return;
                    const name = item.dataset.npcName;
                    if (name) toggleNpcSelection(name);
                });
            });
            
            bindEditButtons();
            
            npcEl.querySelectorAll('.horae-gender-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    npcEl.querySelectorAll('.horae-gender-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const filter = btn.dataset.filter;
                    npcEl.querySelectorAll('.horae-npc-item').forEach(item => {
                        if (filter === 'all') {
                            item.style.display = '';
                        } else {
                            const g = (item.dataset.npcGender || '').toLowerCase();
                            let match = false;
                            if (filter === 'male') match = /^(男|male|m|雄|公)$/.test(g);
                            else if (filter === 'female') match = /^(女|female|f|雌|母)$/.test(g);
                            else if (filter === 'other') match = !(/^(男|male|m|雄|公)$/.test(g) || /^(女|female|f|雌|母)$/.test(g));
                            item.style.display = match ? '' : 'none';
                        }
                    });
                });
            });
        }
    }
    
    // Рендеринг сети отношений
    if (settings.sendRelationships) {
        updateRelationshipDisplay();
    }
}

/**
 * Обновить отображение сети отношений
 */
function updateRelationshipDisplay() {
    const listEl = document.getElementById('horae-relationship-list');
    if (!listEl) return;
    
    const relationships = horaeManager.getRelationships();
    
    if (relationships.length === 0) {
        listEl.innerHTML = '<div class="horae-empty-hint">Нет записей о связях. ИИ запишет их автоматически при взаимодействии персонажей</div>';
        return;
    }
    
    const html = relationships.map((rel, idx) => `
        <div class="horae-relationship-item" data-rel-index="${idx}">
            <div class="horae-rel-content">
                <span class="horae-rel-from">${rel.from}</span>
                <span class="horae-rel-arrow">→</span>
                <span class="horae-rel-to">${rel.to}</span>
                <span class="horae-rel-type">${rel.type}</span>
                ${rel.note ? `<span class="horae-rel-note">${rel.note}</span>` : ''}
            </div>
            <div class="horae-rel-actions">
                <button class="horae-rel-edit" title="Редактировать"><i class="fa-solid fa-pen"></i></button>
                <button class="horae-rel-delete" title="Удалить"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `).join('');
    
    listEl.innerHTML = html;
    
    // Привязать события редактирования/удаления
    listEl.querySelectorAll('.horae-rel-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.closest('.horae-relationship-item').dataset.relIndex);
            openRelationshipEditModal(idx);
        });
    });
    
    listEl.querySelectorAll('.horae-rel-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const idx = parseInt(btn.closest('.horae-relationship-item').dataset.relIndex);
            const rels = horaeManager.getRelationships();
            const rel = rels[idx];
            if (!confirm(`Удалить связь ${rel.from} → ${rel.to}?`)) return;
            rels.splice(idx, 1);
            horaeManager.setRelationships(rels);
            // Синхронно очищать данные об отношениях того же направления во всех сообщениях, чтобы предотвратить воскрешение при rebuildRelationships
            const chat = horaeManager.getChat();
            for (let i = 1; i < chat.length; i++) {
                const meta = chat[i]?.horae_meta;
                if (!meta?.relationships?.length) continue;
                const before = meta.relationships.length;
                meta.relationships = meta.relationships.filter(r => !(r.from === rel.from && r.to === rel.to));
                if (meta.relationships.length !== before) {
                    injectHoraeTagToMessage(i, meta);
                }
            }
            await getContext().saveChat();
            updateRelationshipDisplay();
            showToast('Связь удалена', 'info');
        });
    });
}

function openRelationshipEditModal(editIndex = null) {
    closeEditModal();
    const rels = horaeManager.getRelationships();
    const isEdit = editIndex !== null && editIndex >= 0;
    const existing = isEdit ? rels[editIndex] : { from: '', to: '', type: '', note: '' };
    
    const modalHtml = `
        <div id="horae-edit-modal" class="horae-modal">
            <div class="horae-modal-content">
                <div class="horae-modal-header">
                    <i class="fa-solid fa-diagram-project"></i> ${isEdit ? 'Редактировать связь' : 'Добавить связь'}
                </div>
                <div class="horae-modal-body horae-edit-modal-body">
                    <div class="horae-edit-field">
                        <label>Персонаж A</label>
                        <input type="text" id="horae-rel-from" value="${escapeHtml(existing.from)}" placeholder="Имя персонажа (инициатор связи)">
                    </div>
                    <div class="horae-edit-field">
                        <label>Персонаж B</label>
                        <input type="text" id="horae-rel-to" value="${escapeHtml(existing.to)}" placeholder="Имя персонажа (получатель связи)">
                    </div>
                    <div class="horae-edit-field">
                        <label>Тип связи</label>
                        <input type="text" id="horae-rel-type" value="${escapeHtml(existing.type)}" placeholder="Например: друзья, возлюбленные, начальник/подчинённый, учитель/ученик">
                    </div>
                    <div class="horae-edit-field">
                        <label>Примечание (необязательно)</label>
                        <input type="text" id="horae-rel-note" value="${escapeHtml(existing.note || '')}" placeholder="Дополнительное описание связи">
                    </div>
                </div>
                <div class="horae-modal-footer">
                    <button id="horae-rel-modal-save" class="horae-btn primary">
                        <i class="fa-solid fa-check"></i> Сохранить
                    </button>
                    <button id="horae-rel-modal-cancel" class="horae-btn">
                        <i class="fa-solid fa-xmark"></i> Отмена
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    preventModalBubble();
    
    document.getElementById('horae-edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'horae-edit-modal') closeEditModal();
    });
    
    document.getElementById('horae-rel-modal-save').addEventListener('click', async (e) => {
        e.stopPropagation();
        const from = document.getElementById('horae-rel-from').value.trim();
        const to = document.getElementById('horae-rel-to').value.trim();
        const type = document.getElementById('horae-rel-type').value.trim();
        const note = document.getElementById('horae-rel-note').value.trim();
        
        if (!from || !to || !type) {
            showToast('Имя персонажа и тип связи не могут быть пустыми', 'warning');
            return;
        }
        
        if (isEdit) {
            const oldRel = rels[editIndex];
            rels[editIndex] = { from, to, type, note, _userEdited: true };
            // Синхронно обновлять данные об отношениях во всех сообщениях, чтобы rebuildRelationships не восстановил старые значения
            const chat = horaeManager.getChat();
            for (let i = 1; i < chat.length; i++) {
                const meta = chat[i]?.horae_meta;
                if (!meta?.relationships?.length) continue;
                let changed = false;
                for (let ri = 0; ri < meta.relationships.length; ri++) {
                    const r = meta.relationships[ri];
                    if (r.from === oldRel.from && r.to === oldRel.to) {
                        meta.relationships[ri] = { from, to, type, note };
                        changed = true;
                    }
                }
                if (changed) injectHoraeTagToMessage(i, meta);
            }
        } else {
            rels.push({ from, to, type, note });
        }
        
        horaeManager.setRelationships(rels);
        await getContext().saveChat();
        updateRelationshipDisplay();
        closeEditModal();
        showToast(isEdit ? 'Связь обновлена' : 'Связь добавлена', 'success');
    });
    
    document.getElementById('horae-rel-modal-cancel').addEventListener('click', () => closeEditModal());
}

/**
 * Переключить состояние звёздочки NPC
 */
function toggleNpcFavorite(npcName) {
    if (!settings.favoriteNpcs) {
        settings.favoriteNpcs = [];
    }
    
    const index = settings.favoriteNpcs.indexOf(npcName);
    if (index > -1) {
        // Убрать звёздочку
        settings.favoriteNpcs.splice(index, 1);
        showToast(`Звёздочка у ${npcName} убрана`, 'info');
    } else {
        // Добавить звёздочку
        settings.favoriteNpcs.push(npcName);
        showToast(`${npcName} добавлен в список со звёздочкой`, 'success');
    }
    
    saveSettings();
    updateCharactersDisplay();
}

/**
 * Обновить отображение страницы предметов
 */
function updateItemsDisplay() {
    const state = horaeManager.getLatestState();
    const listEl = document.getElementById('horae-items-full-list');
    const filterEl = document.getElementById('horae-items-filter');
    const holderFilterEl = document.getElementById('horae-items-holder-filter');
    const searchEl = document.getElementById('horae-items-search');
    
    if (!listEl) return;
    
    const filterValue = filterEl?.value || 'all';
    const holderFilter = holderFilterEl?.value || 'all';
    const searchQuery = (searchEl?.value || '').trim().toLowerCase();
    let entries = Object.entries(state.items || {});
    
    if (holderFilterEl) {
        const currentHolder = holderFilterEl.value;
        const holders = new Set();
        entries.forEach(([name, info]) => {
            if (info.holder) holders.add(info.holder);
        });
        
        // Сохранить текущий выбор, обновить список опций
        const holderOptions = ['<option value="all">Все</option>'];
        holders.forEach(holder => {
            holderOptions.push(`<option value="${holder}" ${holder === currentHolder ? 'selected' : ''}>${holder}</option>`);
        });
        holderFilterEl.innerHTML = holderOptions.join('');
    }
    
    // Поиск предметов — по ключевым словам
    if (searchQuery) {
        entries = entries.filter(([name, info]) => {
            const searchTarget = `${name} ${info.icon || ''} ${info.description || ''} ${info.holder || ''} ${info.location || ''}`.toLowerCase();
            return searchTarget.includes(searchQuery);
        });
    }
    
    // Фильтрация предметов — по уровню важности
    if (filterValue !== 'all') {
        entries = entries.filter(([name, info]) => info.importance === filterValue);
    }
    
    // Фильтрация предметов — по владельцу
    if (holderFilter !== 'all') {
        entries = entries.filter(([name, info]) => info.holder === holderFilter);
    }
    
    if (entries.length === 0) {
        let emptyMsg = 'Нет отслеживаемых предметов';
        if (filterValue !== 'all' || holderFilter !== 'all' || searchQuery) {
            emptyMsg = 'Нет предметов, соответствующих фильтру';
        }
        listEl.innerHTML = `
            <div class="horae-empty-state">
                <i class="fa-solid fa-box-open"></i>
                <span>${emptyMsg}</span>
            </div>
        `;
        return;
    }
    
    listEl.innerHTML = entries.map(([name, info]) => {
        const icon = info.icon || '📦';
        const importance = info.importance || '';
        // Поддерживаются два формата: ""/"!"/"!!" и "一般"/"重要"/"关键"
        const isCritical = importance === '!!' || importance === '关键';
        const isImportant = importance === '!' || importance === '重要';
        const importanceClass = isCritical ? 'critical' : isImportant ? 'important' : 'normal';
        // Показать метку
        const importanceLabel = isCritical ? 'Ключевой' : isImportant ? 'Важный' : '';
        const importanceBadge = importanceLabel ? `<span class="horae-item-importance ${importanceClass}">${importanceLabel}</span>` : '';
        
        // Исправить формат отображения: владелец · местоположение
        let positionStr = '';
        if (info.holder && info.location) {
            positionStr = `<span class="holder">${info.holder}</span> · ${info.location}`;
        } else if (info.holder) {
            positionStr = `<span class="holder">${info.holder}</span> владеет`;
        } else if (info.location) {
            positionStr = `Находится: ${info.location}`;
        } else {
            positionStr = 'Местоположение неизвестно';
        }
        
        const isSelected = selectedItems.has(name);
        const selectedClass = isSelected ? 'selected' : '';
        const checkboxDisplay = itemsMultiSelectMode ? 'flex' : 'none';
        const description = info.description || '';
        const descHtml = description ? `<div class="horae-full-item-desc">${description}</div>` : '';
        
        return `
            <div class="horae-full-item horae-editable-item ${importanceClass} ${selectedClass}" data-item-name="${name}">
                <div class="horae-item-checkbox" style="display: ${checkboxDisplay}">
                    <input type="checkbox" ${isSelected ? 'checked' : ''}>
                </div>
                <div class="horae-full-item-icon horae-item-emoji">
                    ${icon}
                </div>
                <div class="horae-full-item-info">
                    <div class="horae-full-item-name">${name} ${importanceBadge}</div>
                    <div class="horae-full-item-location">${positionStr}</div>
                    ${descHtml}
                </div>
                <button class="horae-item-edit-btn" data-edit-type="item" data-edit-name="${name}" title="Редактировать">
                    <i class="fa-solid fa-pen"></i>
                </button>
            </div>
        `;
    }).join('');
    
    bindItemsEvents();
    bindEditButtons();
}

/**
 * Привязать события кнопок редактирования
 */
function bindEditButtons() {
    document.querySelectorAll('.horae-item-edit-btn').forEach(btn => {
        // Удалить старые обработчики (избегать двойной привязки)
        btn.replaceWith(btn.cloneNode(true));
    });
    
    document.querySelectorAll('.horae-item-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const editType = btn.dataset.editType;
            const editName = btn.dataset.editName;
            const messageId = btn.dataset.messageId;
            
            if (editType === 'item') {
                openItemEditModal(editName);
            } else if (editType === 'npc') {
                openNpcEditModal(editName);
            } else if (editType === 'event') {
                const eventIndex = parseInt(btn.dataset.eventIndex) || 0;
                openEventEditModal(parseInt(messageId), eventIndex);
            } else if (editType === 'affection') {
                const charName = btn.dataset.char;
                openAffectionEditModal(charName);
            }
        });
    });
}

/**
 * Открыть окно редактирования предмета
 */
function openItemEditModal(itemName) {
    const state = horaeManager.getLatestState();
    const item = state.items?.[itemName];
    if (!item) {
        showToast('Предмет не найден', 'error');
        return;
    }
    
    const modalHtml = `
        <div id="horae-edit-modal" class="horae-modal">
            <div class="horae-modal-content">
                <div class="horae-modal-header">
                    <i class="fa-solid fa-pen"></i> Редактировать предмет
                </div>
                <div class="horae-modal-body horae-edit-modal-body">
                    <div class="horae-edit-field">
                        <label>Название предмета</label>
                        <input type="text" id="edit-item-name" value="${itemName}" placeholder="Название предмета">
                    </div>
                    <div class="horae-edit-field">
                        <label>Иконка (emoji)</label>
                        <input type="text" id="edit-item-icon" value="${item.icon || ''}" maxlength="2" placeholder="📦">
                    </div>
                    <div class="horae-edit-field">
                        <label>Уровень важности</label>
                        <select id="edit-item-importance">
                            <option value="" ${!item.importance || item.importance === '一般' || item.importance === '' ? 'selected' : ''}>Обычный</option>
                            <option value="!" ${item.importance === '!' || item.importance === '重要' ? 'selected' : ''}>Важный !</option>
                            <option value="!!" ${item.importance === '!!' || item.importance === '关键' ? 'selected' : ''}>Ключевой !!</option>
                        </select>
                    </div>
                    <div class="horae-edit-field">
                        <label>Описание (особые функции/происхождение и т.д.)</label>
                        <textarea id="edit-item-desc" placeholder="Например: подарено Алисой на свидании">${item.description || ''}</textarea>
                    </div>
                    <div class="horae-edit-field">
                        <label>Владелец</label>
                        <input type="text" id="edit-item-holder" value="${item.holder || ''}" placeholder="Имя персонажа">
                    </div>
                    <div class="horae-edit-field">
                        <label>Местоположение</label>
                        <input type="text" id="edit-item-location" value="${item.location || ''}" placeholder="Например: рюкзак, карман, стол в доме">
                    </div>
                </div>
                <div class="horae-modal-footer">
                    <button id="edit-modal-save" class="horae-btn primary">
                        <i class="fa-solid fa-check"></i> Сохранить
                    </button>
                    <button id="edit-modal-cancel" class="horae-btn">
                        <i class="fa-solid fa-xmark"></i> Отмена
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    preventModalBubble();
    
    document.getElementById('edit-modal-save').addEventListener('click', async (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        const newName = document.getElementById('edit-item-name').value.trim();
        if (!newName) {
            showToast('Название предмета не может быть пустым', 'error');
            return;
        }
        
        const newData = {
            icon: document.getElementById('edit-item-icon').value || item.icon,
            importance: document.getElementById('edit-item-importance').value,
            description: document.getElementById('edit-item-desc').value,
            holder: document.getElementById('edit-item-holder').value,
            location: document.getElementById('edit-item-location').value
        };
        
        // Обновить этот предмет во всех сообщениях
        const chat = horaeManager.getChat();
        const nameChanged = newName !== itemName;
        
        for (let i = 0; i < chat.length; i++) {
            const meta = chat[i].horae_meta;
            if (meta?.items?.[itemName]) {
                if (nameChanged) {
                    meta.items[newName] = { ...meta.items[itemName], ...newData };
                    delete meta.items[itemName];
                } else {
                    Object.assign(meta.items[itemName], newData);
                }
                injectHoraeTagToMessage(i, meta);
            }
        }
        
        await getContext().saveChat();
        closeEditModal();
        updateItemsDisplay();
        updateStatusDisplay();
        showToast(nameChanged ? 'Предмет переименован и обновлён' : 'Предмет обновлён', 'success');
    });
    
    document.getElementById('edit-modal-cancel').addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeEditModal();
    });
}

/**
 * Открыть диалог редактирования расположения
 */
function openAffectionEditModal(charName) {
    const state = horaeManager.getLatestState();
    const currentValue = state.affection?.[charName] || 0;
    const numValue = typeof currentValue === 'number' ? currentValue : parseFloat(currentValue) || 0;
    const level = horaeManager.getAffectionLevel(numValue);
    
    const modalHtml = `
        <div id="horae-edit-modal" class="horae-modal">
            <div class="horae-modal-content">
                <div class="horae-modal-header">
                    <i class="fa-solid fa-heart"></i> Редактировать расположение: ${charName}
                </div>
                <div class="horae-modal-body horae-edit-modal-body">
                    <div class="horae-edit-field">
                        <label>Текущее расположение</label>
                        <input type="number" step="0.1" id="edit-affection-value" value="${numValue}" placeholder="0-100">
                    </div>
                    <div class="horae-edit-field">
                        <label>Уровень расположения</label>
                        <span class="horae-affection-level-preview">${level}</span>
                    </div>
                </div>
                <div class="horae-modal-footer">
                    <button id="edit-modal-save" class="horae-btn primary">
                        <i class="fa-solid fa-check"></i> Сохранить
                    </button>
                    <button id="edit-modal-delete" class="horae-btn danger">
                        <i class="fa-solid fa-trash"></i> Удалить
                    </button>
                    <button id="edit-modal-cancel" class="horae-btn">
                        <i class="fa-solid fa-xmark"></i> Отмена
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    preventModalBubble();
    
    // Обновление предпросмотра уровня расположения в реальном времени
    document.getElementById('edit-affection-value').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        const newLevel = horaeManager.getAffectionLevel(val);
        document.querySelector('.horae-affection-level-preview').textContent = newLevel;
    });
    
    document.getElementById('edit-modal-save').addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        const newValue = parseFloat(document.getElementById('edit-affection-value').value) || 0;
        
        const chat = horaeManager.getChat();
        let lastMessageWithAffection = -1;
        
        for (let i = chat.length - 1; i >= 0; i--) {
            const meta = chat[i].horae_meta;
            if (meta?.affection?.[charName] !== undefined) {
                lastMessageWithAffection = i;
                break;
            }
        }
        
        if (lastMessageWithAffection >= 0) {
            chat[lastMessageWithAffection].horae_meta.affection[charName] = { 
                type: 'absolute', 
                value: newValue 
            };
        } else {
            const lastMeta = chat[chat.length - 1]?.horae_meta;
            if (lastMeta) {
                if (!lastMeta.affection) lastMeta.affection = {};
                lastMeta.affection[charName] = { type: 'absolute', value: newValue };
            }
        }
        
        getContext().saveChat();
        closeEditModal();
        updateCharactersDisplay();
        showToast('Расположение обновлено', 'success');
    });

    // Удалить все записи расположения для персонажа
    document.getElementById('edit-modal-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (!confirm(`Удалить записи расположения «${charName}»? Будет удалено из всех сообщений.`)) return;
        const chat = horaeManager.getChat();
        let removed = 0;
        for (let i = 0; i < chat.length; i++) {
            const meta = chat[i].horae_meta;
            if (meta?.affection?.[charName] !== undefined) {
                delete meta.affection[charName];
                removed++;
            }
        }
        getContext().saveChat();
        closeEditModal();
        updateCharactersDisplay();
        showToast(`Расположение «${charName}» удалено (${removed} записей)`, 'info');
    });
    
    document.getElementById('edit-modal-cancel').addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeEditModal();
    });
}

/**
 * Полное каскадное удаление NPC: очищает npcs/affection/relationships/mood/costumes/RPG во всех сообщениях
 * и записывает в chat[0]._deletedNpcs для предотвращения отката rebuild.
 */
function _cascadeDeleteNpcs(names) {
    if (!names?.length) return;
    const chat = horaeManager.getChat();
    const nameSet = new Set(names);
    
    for (let i = 0; i < chat.length; i++) {
        const meta = chat[i].horae_meta;
        if (!meta) continue;
        let changed = false;
        for (const name of nameSet) {
            if (meta.npcs?.[name]) { delete meta.npcs[name]; changed = true; }
            if (meta.affection?.[name]) { delete meta.affection[name]; changed = true; }
            if (meta.costumes?.[name]) { delete meta.costumes[name]; changed = true; }
            if (meta.mood?.[name]) { delete meta.mood[name]; changed = true; }
        }
        if (meta.scene?.characters_present) {
            const before = meta.scene.characters_present.length;
            meta.scene.characters_present = meta.scene.characters_present.filter(c => !nameSet.has(c));
            if (meta.scene.characters_present.length !== before) changed = true;
        }
        if (meta.relationships?.length) {
            const before = meta.relationships.length;
            meta.relationships = meta.relationships.filter(r => !nameSet.has(r.source) && !nameSet.has(r.target));
            if (meta.relationships.length !== before) changed = true;
        }
        if (changed && i > 0) injectHoraeTagToMessage(i, meta);
    }
    
    // RPG данные
    const rpg = chat[0]?.horae_meta?.rpg;
    if (rpg) {
        for (const name of nameSet) {
            for (const sub of ['bars', 'status', 'skills', 'attributes']) {
                if (rpg[sub]?.[name]) delete rpg[sub][name];
            }
        }
    }
    
    // pinnedNpcs
    if (settings.pinnedNpcs) {
        settings.pinnedNpcs = settings.pinnedNpcs.filter(n => !nameSet.has(n));
        saveSettings();
    }
    
    // Антиоткат: запись в chat[0]
    if (!chat[0].horae_meta) chat[0].horae_meta = createEmptyMeta();
    if (!chat[0].horae_meta._deletedNpcs) chat[0].horae_meta._deletedNpcs = [];
    for (const name of nameSet) {
        if (!chat[0].horae_meta._deletedNpcs.includes(name)) {
            chat[0].horae_meta._deletedNpcs.push(name);
        }
    }
}

/**
 * Открыть диалог редактирования NPC
 */
function openNpcEditModal(npcName) {
    const state = horaeManager.getLatestState();
    const npc = state.npcs?.[npcName];
    if (!npc) {
        showToast('Персонаж не найден', 'error');
        return;
    }
    
    const isPinned = (settings.pinnedNpcs || []).includes(npcName);
    
    // Варианты пола
    const genderVal = npc.gender || '';
    const genderOptions = [
        { val: '', label: 'Неизвестно' },
        { val: '男', label: 'Мужской' },
        { val: '女', label: 'Женский' },
        { val: '其他', label: 'Другой' }
    ].map(o => `<option value="${o.val}" ${genderVal === o.val ? 'selected' : ''}>${o.label}</option>`).join('');
    
    const modalHtml = `
        <div id="horae-edit-modal" class="horae-modal">
            <div class="horae-modal-content">
                <div class="horae-modal-header">
                    <i class="fa-solid fa-pen"></i> Редактировать персонажа: ${npcName}
                </div>
                <div class="horae-modal-body horae-edit-modal-body">
                    <div class="horae-edit-field">
                        <label>Имя персонажа${npc._aliases?.length ? ` <span style="font-weight:normal;color:var(--horae-text-dim)">(псевдонимы: ${npc._aliases.join('、')})</span>` : ''}</label>
                        <input type="text" id="edit-npc-name" value="${npcName}" placeholder="При смене имени старое сохранится как псевдоним">
                    </div>
                    <div class="horae-edit-field">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                            <input type="checkbox" id="edit-npc-pinned" ${isPinned ? 'checked' : ''}>
                            <i class="fa-solid fa-crown" style="color:${isPinned ? '#b388ff' : '#666'}"></i>
                            Пометить как важного персонажа (закрепить + особая рамка)
                        </label>
                    </div>
                    <div class="horae-edit-field-row">
                        <div class="horae-edit-field horae-edit-field-compact">
                            <label>Пол</label>
                            <select id="edit-npc-gender">${genderOptions}</select>
                        </div>
                        <div class="horae-edit-field horae-edit-field-compact">
                            <label>Возраст${(() => {
                                const ar = horaeManager.calcCurrentAge(npc, state.timestamp?.story_date);
                                return ar.changed ? ` <span style="font-weight:normal;color:var(--horae-accent)">(текущий расчёт:${ar.display})</span>` : '';
                            })()}</label>
                            <input type="text" id="edit-npc-age" value="${npc.age || ''}" placeholder="напр.: 25, около 35">
                        </div>
                        <div class="horae-edit-field horae-edit-field-compact">
                            <label>Раса</label>
                            <input type="text" id="edit-npc-race" value="${npc.race || ''}" placeholder="напр.: человек, эльф">
                        </div>
                        <div class="horae-edit-field horae-edit-field-compact">
                            <label>Профессия</label>
                            <input type="text" id="edit-npc-job" value="${npc.job || ''}" placeholder="напр.: наёмник, студент">
                        </div>
                    </div>
                    <div class="horae-edit-field">
                        <label>Внешность</label>
                        <textarea id="edit-npc-appearance" placeholder="напр.: молодая светловолосая женщина">${npc.appearance || ''}</textarea>
                    </div>
                    <div class="horae-edit-field">
                        <label>Характер</label>
                        <input type="text" id="edit-npc-personality" value="${npc.personality || ''}" placeholder="напр.: весёлый, жизнерадостный">
                    </div>
                    <div class="horae-edit-field">
                        <label>Статус/отношения</label>
                        <input type="text" id="edit-npc-relationship" value="${npc.relationship || ''}" placeholder="напр.: сосед главного героя">
                    </div>
                    <div class="horae-edit-field">
                        <label>Дополнительно</label>
                        <input type="text" id="edit-npc-note" value="${npc.note || ''}" placeholder="прочая важная информация (необязательно)">
                    </div>
                </div>
                <div class="horae-modal-footer">
                    <button id="edit-modal-delete" class="horae-btn danger" style="background:#c62828;color:#fff;margin-right:auto;">
                        <i class="fa-solid fa-trash"></i> Удалить персонажа
                    </button>
                    <button id="edit-modal-save" class="horae-btn primary">
                        <i class="fa-solid fa-check"></i> Сохранить
                    </button>
                    <button id="edit-modal-cancel" class="horae-btn">
                        <i class="fa-solid fa-xmark"></i> Отмена
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    preventModalBubble();
    
    // Удалить NPC (полный каскад: npcs/affection/relationships/mood/costumes/RPG + антиоткат)
    document.getElementById('edit-modal-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (!confirm(`Удалить персонажа «${npcName}»?\n\nВся информация о нём будет удалена из всех сообщений (расположение, отношения, RPG-данные и т.д.), восстановление невозможно.`)) return;
        
        _cascadeDeleteNpcs([npcName]);
        
        await getContext().saveChat();
        closeEditModal();
        refreshAllDisplays();
        showToast(`Персонаж «${npcName}» удалён`, 'success');
    });
    
    // Сохранить изменения NPC (поддержка переименования + псевдонимов)
    document.getElementById('edit-modal-save').addEventListener('click', async (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        const chat = horaeManager.getChat();
        const newName = document.getElementById('edit-npc-name').value.trim();
        const newAge = document.getElementById('edit-npc-age').value;
        const newData = {
            appearance: document.getElementById('edit-npc-appearance').value,
            personality: document.getElementById('edit-npc-personality').value,
            relationship: document.getElementById('edit-npc-relationship').value,
            gender: document.getElementById('edit-npc-gender').value,
            age: newAge,
            race: document.getElementById('edit-npc-race').value,
            job: document.getElementById('edit-npc-job').value,
            note: document.getElementById('edit-npc-note').value
        };
        
        if (!newName) { showToast('Имя персонажа не может быть пустым', 'warning'); return; }
        
        const currentState = horaeManager.getLatestState();
        const ageChanged = newAge !== (npc.age || '');
        if (ageChanged && newAge) {
            newData._ageRefDate = currentState.timestamp?.story_date || '';
        }
        
        const isRename = newName !== npcName;
        
        // Переименование: каскадная миграция ключей во всех сообщениях + запись псевдонима
        if (isRename) {
            const aliases = npc._aliases ? [...npc._aliases] : [];
            if (!aliases.includes(npcName)) aliases.push(npcName);
            newData._aliases = aliases;
            
            for (let i = 0; i < chat.length; i++) {
                const meta = chat[i].horae_meta;
                if (!meta) continue;
                let changed = false;
                if (meta.npcs?.[npcName]) {
                    meta.npcs[newName] = { ...meta.npcs[npcName], ...newData };
                    delete meta.npcs[npcName];
                    changed = true;
                }
                if (meta.affection?.[npcName]) {
                    meta.affection[newName] = meta.affection[npcName];
                    delete meta.affection[npcName];
                    changed = true;
                }
                if (meta.costumes?.[npcName]) {
                    meta.costumes[newName] = meta.costumes[npcName];
                    delete meta.costumes[npcName];
                    changed = true;
                }
                if (meta.mood?.[npcName]) {
                    meta.mood[newName] = meta.mood[npcName];
                    delete meta.mood[npcName];
                    changed = true;
                }
                if (meta.scene?.characters_present) {
                    const idx = meta.scene.characters_present.indexOf(npcName);
                    if (idx !== -1) { meta.scene.characters_present[idx] = newName; changed = true; }
                }
                if (meta.relationships?.length) {
                    for (const rel of meta.relationships) {
                        if (rel.source === npcName) { rel.source = newName; changed = true; }
                        if (rel.target === npcName) { rel.target = newName; changed = true; }
                    }
                }
                if (changed && i > 0) injectHoraeTagToMessage(i, meta);
            }
            
            // Миграция RPG данных
            const rpg = chat[0]?.horae_meta?.rpg;
            if (rpg) {
                for (const sub of ['bars', 'status', 'skills', 'attributes']) {
                    if (rpg[sub]?.[npcName]) {
                        rpg[sub][newName] = rpg[sub][npcName];
                        delete rpg[sub][npcName];
                    }
                }
            }
            
            // Миграция pinnedNpcs
            if (settings.pinnedNpcs) {
                const idx = settings.pinnedNpcs.indexOf(npcName);
                if (idx !== -1) settings.pinnedNpcs[idx] = newName;
            }
        } else {
            // Без переименования, только обновление атрибутов
            for (let i = 0; i < chat.length; i++) {
                const meta = chat[i].horae_meta;
                if (meta?.npcs?.[npcName]) {
                    Object.assign(meta.npcs[npcName], newData);
                    injectHoraeTagToMessage(i, meta);
                }
            }
        }
        
        // Обработка пометки «важный персонаж»
        const finalName = isRename ? newName : npcName;
        const newPinned = document.getElementById('edit-npc-pinned').checked;
        if (!settings.pinnedNpcs) settings.pinnedNpcs = [];
        const pinIdx = settings.pinnedNpcs.indexOf(finalName);
        if (newPinned && pinIdx === -1) {
            settings.pinnedNpcs.push(finalName);
        } else if (!newPinned && pinIdx !== -1) {
            settings.pinnedNpcs.splice(pinIdx, 1);
        }
        saveSettings();
        
        await getContext().saveChat();
        closeEditModal();
        refreshAllDisplays();
        showToast(isRename ? `Персонаж переименован в «${newName}»` : 'Персонаж обновлён', 'success');
    });
    
    document.getElementById('edit-modal-cancel').addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeEditModal();
    });
}

/** Открыть диалог редактирования события */
function openEventEditModal(messageId, eventIndex = 0) {
    const meta = horaeManager.getMessageMeta(messageId);
    if (!meta) {
        showToast('Метаданные сообщения не найдены', 'error');
        return;
    }
    
    // Совместимость нового и старого формата событий
    const eventsArr = meta.events || (meta.event ? [meta.event] : []);
    const event = eventsArr[eventIndex] || {};
    const totalEvents = eventsArr.length;
    
    const modalHtml = `
        <div id="horae-edit-modal" class="horae-modal">
            <div class="horae-modal-content">
                <div class="horae-modal-header">
                    <i class="fa-solid fa-pen"></i> Редактировать событие #${messageId}${totalEvents > 1 ? ` (${eventIndex + 1}/${totalEvents})` : ''}
                </div>
                <div class="horae-modal-body horae-edit-modal-body">
                    <div class="horae-edit-field">
                        <label>Уровень события</label>
                        <select id="edit-event-level">
                            <option value="一般" ${event.level === '一般' || !event.level ? 'selected' : ''}>Обычное</option>
                            <option value="重要" ${event.level === '重要' ? 'selected' : ''}>Важное</option>
                            <option value="关键" ${event.level === '关键' ? 'selected' : ''}>Ключевое</option>
                            <option value="摘要" ${event.level === '摘要' ? 'selected' : ''}>Сводка</option>
                        </select>
                    </div>
                    <div class="horae-edit-field">
                        <label>Краткое описание события</label>
                        <textarea id="edit-event-summary" placeholder="Опишите это событие...">${event.summary || ''}</textarea>
                    </div>
                </div>
                <div class="horae-modal-footer">
                    <button id="edit-modal-delete" class="horae-btn danger">
                        <i class="fa-solid fa-trash"></i> Удалить
                    </button>
                    <button id="edit-modal-save" class="horae-btn primary">
                        <i class="fa-solid fa-check"></i> Сохранить
                    </button>
                    <button id="edit-modal-cancel" class="horae-btn">
                        <i class="fa-solid fa-xmark"></i> Отмена
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    preventModalBubble();
    
    document.getElementById('edit-modal-save').addEventListener('click', async (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        const chat = horaeManager.getChat();
        const chatMeta = chat[messageId]?.horae_meta;
        if (chatMeta) {
            const newLevel = document.getElementById('edit-event-level').value;
            const newSummary = document.getElementById('edit-event-summary').value.trim();
            
            // Подтверждение: пустое описание = удаление события
            if (!newSummary) {
                if (!confirm('Описание события пусто!\n\nПосле сохранения событие будет удалено.\n\nПодтвердить удаление?')) {
                    return;
                }
                // Пользователь подтвердил удаление, выполнить логику удаления
                if (!chatMeta.events) {
                    chatMeta.events = chatMeta.event ? [chatMeta.event] : [];
                }
                if (chatMeta.events.length > eventIndex) {
                    chatMeta.events.splice(eventIndex, 1);
                }
                delete chatMeta.event;
                
                await getContext().saveChat();
                closeEditModal();
                updateTimelineDisplay();
                showToast('Событие удалено', 'success');
                return;
            }
            
            // Убедиться, что массив events существует
            if (!chatMeta.events) {
                chatMeta.events = chatMeta.event ? [chatMeta.event] : [];
            }
            
            // Обновить или добавить событие
            const isSummaryLevel = newLevel === '摘要';
            if (chatMeta.events[eventIndex]) {
                chatMeta.events[eventIndex] = {
                    is_important: newLevel === '重要' || newLevel === '关键',
                    level: newLevel,
                    summary: newSummary,
                    ...(isSummaryLevel ? { isSummary: true } : {})
                };
            } else {
                chatMeta.events.push({
                    is_important: newLevel === '重要' || newLevel === '关键',
                    level: newLevel,
                    summary: newSummary,
                    ...(isSummaryLevel ? { isSummary: true } : {})
                });
            }
            
            // Очистить старый формат
            delete chatMeta.event;
        }
        
        await getContext().saveChat();
        closeEditModal();
        updateTimelineDisplay();
        showToast('Событие обновлено', 'success');
    });
    
    // Удалить событие (с подтверждением)
    document.getElementById('edit-modal-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (confirm('Удалить это событие?\n\n⚠️ Это действие необратимо!')) {
            const chat = horaeManager.getChat();
            const chatMeta = chat[messageId]?.horae_meta;
            if (chatMeta) {
                // Убедиться, что массив events существует
                if (!chatMeta.events) {
                    chatMeta.events = chatMeta.event ? [chatMeta.event] : [];
                }
                
                // Удалить событие по указанному индексу
                if (chatMeta.events.length > eventIndex) {
                    chatMeta.events.splice(eventIndex, 1);
                }
                
                // Очистить старый формат
                delete chatMeta.event;
                
                getContext().saveChat();
                closeEditModal();
                updateTimelineDisplay();
                showToast('Событие удалено', 'success');
            }
        }
    });
    
    document.getElementById('edit-modal-cancel').addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeEditModal();
    });
}

/**
 * Закрыть диалог редактирования
 */
function closeEditModal() {
    const modal = document.getElementById('horae-edit-modal');
    if (modal) modal.remove();
}

/** Предотвратить всплытие событий в диалоге */
function preventModalBubble() {
    const targets = [
        document.getElementById('horae-edit-modal'),
        ...document.querySelectorAll('.horae-edit-modal-backdrop')
    ].filter(Boolean);

    targets.forEach(modal => {
        // Наследовать режим темы
        if (isLightMode()) modal.classList.add('horae-light');

        ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach(evType => {
            modal.addEventListener(evType, (e) => {
                e.stopPropagation();
            });
        });
    });
}

// ============================================
// Функция пользовательских таблиц в стиле Excel
// ============================================

// Независимые стеки Undo/Redo для каждой таблицы, ключ = tableId
const TABLE_HISTORY_MAX = 20;
const _perTableUndo = {};  // { tableId: [snapshot, ...] }
const _perTableRedo = {};  // { tableId: [snapshot, ...] }

function _getTableId(scope, tableIndex) {
    const tables = getTablesByScope(scope);
    return tables[tableIndex]?.id || `${scope}_${tableIndex}`;
}

function _deepCopyOneTable(scope, tableIndex) {
    const tables = getTablesByScope(scope);
    if (!tables[tableIndex]) return null;
    return JSON.parse(JSON.stringify(tables[tableIndex]));
}

/** Вызывать перед изменением: сохранить снимок таблицы в стек undo */
function pushTableSnapshot(scope, tableIndex) {
    if (tableIndex == null) return;
    const tid = _getTableId(scope, tableIndex);
    const snap = _deepCopyOneTable(scope, tableIndex);
    if (!snap) return;
    if (!_perTableUndo[tid]) _perTableUndo[tid] = [];
    _perTableUndo[tid].push({ scope, tableIndex, table: snap });
    if (_perTableUndo[tid].length > TABLE_HISTORY_MAX) _perTableUndo[tid].shift();
    _perTableRedo[tid] = [];
    _updatePerTableUndoRedoButtons(tid);
}

/** Отменить действие в таблице */
function undoSingleTable(tid) {
    const stack = _perTableUndo[tid];
    if (!stack?.length) return;
    const snap = stack.pop();
    const tables = getTablesByScope(snap.scope);
    if (!tables[snap.tableIndex]) return;
    // Сохранить текущее состояние в redo
    if (!_perTableRedo[tid]) _perTableRedo[tid] = [];
    _perTableRedo[tid].push({
        scope: snap.scope,
        tableIndex: snap.tableIndex,
        table: JSON.parse(JSON.stringify(tables[snap.tableIndex]))
    });
    tables[snap.tableIndex] = snap.table;
    setTablesByScope(snap.scope, tables);
    renderCustomTablesList();
    showToast('Операция с таблицей отменена', 'info');
}

/** Повторить действие в таблице */
function redoSingleTable(tid) {
    const stack = _perTableRedo[tid];
    if (!stack?.length) return;
    const snap = stack.pop();
    const tables = getTablesByScope(snap.scope);
    if (!tables[snap.tableIndex]) return;
    if (!_perTableUndo[tid]) _perTableUndo[tid] = [];
    _perTableUndo[tid].push({
        scope: snap.scope,
        tableIndex: snap.tableIndex,
        table: JSON.parse(JSON.stringify(tables[snap.tableIndex]))
    });
    tables[snap.tableIndex] = snap.table;
    setTablesByScope(snap.scope, tables);
    renderCustomTablesList();
    showToast('Операция с таблицей восстановлена', 'info');
}

function _updatePerTableUndoRedoButtons(tid) {
    const undoBtn = document.querySelector(`.horae-table-undo-btn[data-table-id="${tid}"]`);
    const redoBtn = document.querySelector(`.horae-table-redo-btn[data-table-id="${tid}"]`);
    if (undoBtn) undoBtn.disabled = !_perTableUndo[tid]?.length;
    if (redoBtn) redoBtn.disabled = !_perTableRedo[tid]?.length;
}

/** При смене диалога очищать все стеки undo/redo */
function clearTableHistory() {
    for (const k of Object.keys(_perTableUndo)) delete _perTableUndo[k];
    for (const k of Object.keys(_perTableRedo)) delete _perTableRedo[k];
}

let activeContextMenu = null;

/**
 * Рендеринг списка пользовательских таблиц
 */
function renderCustomTablesList() {
    const listEl = document.getElementById('horae-custom-tables-list');
    if (!listEl) return;

    const globalTables = getGlobalTables();
    const chatTables = getChatTables();

    if (globalTables.length === 0 && chatTables.length === 0) {
        listEl.innerHTML = `
            <div class="horae-custom-tables-empty">
                <i class="fa-solid fa-table-cells"></i>
                <div>Нет пользовательских таблиц</div>
                <div style="font-size:11px;opacity:0.7;margin-top:4px;">Нажмите кнопку ниже, чтобы добавить таблицу</div>
            </div>
        `;
        return;
    }

    /** Рендеринг отдельной таблицы */
    function renderOneTable(table, idx, scope) {
        const rows = table.rows || 2;
        const cols = table.cols || 2;
        const data = table.data || {};
        const lockedRows = new Set(table.lockedRows || []);
        const lockedCols = new Set(table.lockedCols || []);
        const lockedCells = new Set(table.lockedCells || []);
        const isGlobal = scope === 'global';
        const scopeIcon = isGlobal ? 'fa-globe' : 'fa-bookmark';
        const scopeLabel = isGlobal ? 'Глобальная' : 'Локальная';
        const scopeTitle = isGlobal ? 'Глобальная таблица, доступна во всех диалогах' : 'Локальная таблица, только текущий диалог';

        let tableHtml = '<table class="horae-excel-table">';
        for (let r = 0; r < rows; r++) {
            const rowLocked = lockedRows.has(r);
            tableHtml += '<tr>';
            for (let c = 0; c < cols; c++) {
                const cellKey = `${r}-${c}`;
                const cellValue = data[cellKey] || '';
                const isHeader = r === 0 || c === 0;
                const tag = isHeader ? 'th' : 'td';
                const cellLocked = rowLocked || lockedCols.has(c) || lockedCells.has(cellKey);
                const charLen = [...cellValue].reduce((sum, ch) => sum + (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1), 0);
                const inputSize = Math.max(4, Math.min(charLen + 2, 40));
                const lockedClass = cellLocked ? ' horae-cell-locked' : '';
                tableHtml += `<${tag} data-row="${r}" data-col="${c}" class="${lockedClass}">`;
                tableHtml += `<input type="text" value="${escapeHtml(cellValue)}" size="${inputSize}" data-scope="${scope}" data-table="${idx}" data-row="${r}" data-col="${c}" placeholder="${isHeader ? 'Заголовок' : ''}">`;
                tableHtml += `</${tag}>`;
            }
            tableHtml += '</tr>';
        }
        tableHtml += '</table>';

        const tid = table.id || `${scope}_${idx}`;
        const hasUndo = !!(_perTableUndo[tid]?.length);
        const hasRedo = !!(_perTableRedo[tid]?.length);

        return `
            <div class="horae-excel-table-container" data-table-index="${idx}" data-scope="${scope}" data-table-id="${tid}">
                <div class="horae-excel-table-header">
                    <div class="horae-excel-table-title">
                        <i class="fa-solid ${scopeIcon}" title="${scopeTitle}" style="color:${isGlobal ? 'var(--horae-accent)' : 'var(--horae-primary-light)'}; cursor:pointer;" data-toggle-scope="${idx}" data-scope="${scope}"></i>
                        <span class="horae-table-scope-label" data-toggle-scope="${idx}" data-scope="${scope}" title="Нажмите для переключения глобальная/локальная">${scopeLabel}</span>
                        <input type="text" value="${escapeHtml(table.name || '')}" placeholder="название таблицы" data-table-name="${idx}" data-scope="${scope}">
                    </div>
                    <div class="horae-excel-table-actions">
                        <button class="horae-table-undo-btn" title="Отменить" data-table-id="${tid}" ${hasUndo ? '' : 'disabled'}>
                            <i class="fa-solid fa-rotate-left"></i>
                        </button>
                        <button class="horae-table-redo-btn" title="Повторить" data-table-id="${tid}" ${hasRedo ? '' : 'disabled'}>
                            <i class="fa-solid fa-rotate-right"></i>
                        </button>
                        <button class="clear-table-data-btn" title="Очистить данные (сохранить заголовки)" data-table-index="${idx}" data-scope="${scope}">
                            <i class="fa-solid fa-eraser"></i>
                        </button>
                        <button class="export-table-btn" title="Экспортировать таблицу" data-table-index="${idx}" data-scope="${scope}">
                            <i class="fa-solid fa-download"></i>
                        </button>
                        <button class="delete-table-btn danger" title="Удалить таблицу" data-table-index="${idx}" data-scope="${scope}">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div><!-- header -->
                <div class="horae-excel-table-wrapper">
                    ${tableHtml}
                </div>
                <div class="horae-table-prompt-row">
                    <input type="text" value="${escapeHtml(table.prompt || '')}" placeholder="промпт: как ИИ должен заполнять эту таблицу..." data-table-prompt="${idx}" data-scope="${scope}">
                </div>
            </div>
        `;
    }

    let html = '';
    if (globalTables.length > 0) {
        html += `<div class="horae-tables-group-label"><i class="fa-solid fa-globe"></i> Глобальные таблицы</div>`;
        html += globalTables.map((t, i) => renderOneTable(t, i, 'global')).join('');
    }
    if (chatTables.length > 0) {
        html += `<div class="horae-tables-group-label"><i class="fa-solid fa-bookmark"></i> Локальные таблицы (текущий диалог)</div>`;
        html += chatTables.map((t, i) => renderOneTable(t, i, 'local')).join('');
    }
    listEl.innerHTML = html;

    bindExcelTableEvents();
}

/**
 * HTML-экранирование
 */
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
}

/**
 * Привязка событий таблицы Excel
 */
function bindExcelTableEvents() {
    /** Получить scope из атрибутов элемента */
    const getScope = (el) => el.dataset.scope || el.closest('[data-scope]')?.dataset.scope || 'local';

    // Событие ввода ячейки — автосохранение + динамическая подстройка ширины
    document.querySelectorAll('.horae-excel-table input').forEach(input => {
        input.addEventListener('focus', (e) => {
            e.target._horaeSnapshotPushed = false;
        });
        input.addEventListener('change', (e) => {
            const scope = getScope(e.target);
            const tableIndex = parseInt(e.target.dataset.table);
            if (!e.target._horaeSnapshotPushed) {
                pushTableSnapshot(scope, tableIndex);
                e.target._horaeSnapshotPushed = true;
            }
            const row = parseInt(e.target.dataset.row);
            const col = parseInt(e.target.dataset.col);
            const value = e.target.value;

            const tables = getTablesByScope(scope);
            if (!tables[tableIndex]) return;
            if (!tables[tableIndex].data) tables[tableIndex].data = {};
            const key = `${row}-${col}`;
            if (value.trim()) {
                tables[tableIndex].data[key] = value;
            } else {
                delete tables[tableIndex].data[key];
            }
            if (row > 0 && col > 0) {
                purgeTableContributions((tables[tableIndex].name || '').trim(), scope);
            }
            setTablesByScope(scope, tables);
        });
        input.addEventListener('input', (e) => {
            const val = e.target.value;
            const charLen = [...val].reduce((sum, ch) => sum + (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1), 0);
            e.target.size = Math.max(4, Math.min(charLen + 2, 40));
        });
    });

    // Событие ввода названия таблицы
    document.querySelectorAll('input[data-table-name]').forEach(input => {
        input.addEventListener('change', (e) => {
            const scope = getScope(e.target);
            const tableIndex = parseInt(e.target.dataset.tableName);
            pushTableSnapshot(scope, tableIndex);
            const tables = getTablesByScope(scope);
            if (!tables[tableIndex]) return;
            tables[tableIndex].name = e.target.value;
            setTablesByScope(scope, tables);
        });
    });

    // Событие ввода промпта таблицы
    document.querySelectorAll('input[data-table-prompt]').forEach(input => {
        input.addEventListener('change', (e) => {
            const scope = getScope(e.target);
            const tableIndex = parseInt(e.target.dataset.tablePrompt);
            pushTableSnapshot(scope, tableIndex);
            const tables = getTablesByScope(scope);
            if (!tables[tableIndex]) return;
            tables[tableIndex].prompt = e.target.value;
            setTablesByScope(scope, tables);
        });
    });

    // Кнопка экспорта таблицы
    document.querySelectorAll('.export-table-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const scope = getScope(btn);
            const tableIndex = parseInt(btn.dataset.tableIndex);
            exportTable(tableIndex, scope);
        });
    });

    // Кнопка удаления таблицы
    document.querySelectorAll('.delete-table-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const container = btn.closest('.horae-excel-table-container');
            const scope = getScope(container);
            const tableIndex = parseInt(container.dataset.tableIndex);
            deleteCustomTable(tableIndex, scope);
        });
    });

    // Кнопка очистки данных таблицы (сохранить заголовки)
    document.querySelectorAll('.clear-table-data-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const scope = getScope(btn);
            const tableIndex = parseInt(btn.dataset.tableIndex);
            clearTableData(tableIndex, scope);
        });
    });

    // Переключение глобальная/локальная
    document.querySelectorAll('[data-toggle-scope]').forEach(el => {
        el.addEventListener('click', (e) => {
            const currentScope = el.dataset.scope;
            const tableIndex = parseInt(el.dataset.toggleScope);
            toggleTableScope(tableIndex, currentScope);
        });
    });
    
    // Длинное нажатие/ПКМ на любой ячейке показывает меню
    document.querySelectorAll('.horae-excel-table th, .horae-excel-table td').forEach(cell => {
        let pressTimer = null;

        const startPress = (e) => {
            pressTimer = setTimeout(() => {
                const tableContainer = cell.closest('.horae-excel-table-container');
                const tableIndex = parseInt(tableContainer.dataset.tableIndex);
                const scope = tableContainer.dataset.scope || 'local';
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                showTableContextMenu(e, tableIndex, row, col, scope);
            }, 500);
        };

        const cancelPress = () => {
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        };

        cell.addEventListener('mousedown', (e) => { e.stopPropagation(); startPress(e); });
        cell.addEventListener('touchstart', (e) => { e.stopPropagation(); startPress(e); }, { passive: false });
        cell.addEventListener('mouseup', (e) => { e.stopPropagation(); cancelPress(); });
        cell.addEventListener('mouseleave', cancelPress);
        cell.addEventListener('touchend', (e) => { e.stopPropagation(); cancelPress(); });
        cell.addEventListener('touchcancel', cancelPress);

        cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const tableContainer = cell.closest('.horae-excel-table-container');
            const tableIndex = parseInt(tableContainer.dataset.tableIndex);
            const scope = tableContainer.dataset.scope || 'local';
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            showTableContextMenu(e, tableIndex, row, col, scope);
        });
    });

    // Независимые кнопки Undo/Redo для каждой таблицы
    document.querySelectorAll('.horae-table-undo-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            undoSingleTable(btn.dataset.tableId);
        });
    });
    document.querySelectorAll('.horae-table-redo-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            redoSingleTable(btn.dataset.tableId);
        });
    });
}

/** Показ контекстного меню таблицы */
let contextMenuCloseHandler = null;

function showTableContextMenu(e, tableIndex, row, col, scope = 'local') {
    hideContextMenu();

    const tables = getTablesByScope(scope);
    const table = tables[tableIndex];
    if (!table) return;
    const lockedRows = new Set(table.lockedRows || []);
    const lockedCols = new Set(table.lockedCols || []);
    const lockedCells = new Set(table.lockedCells || []);
    const cellKey = `${row}-${col}`;
    const isCellLocked = lockedCells.has(cellKey) || lockedRows.has(row) || lockedCols.has(col);

    const isRowHeader = col === 0;
    const isColHeader = row === 0;
    const isCorner = row === 0 && col === 0;

    let menuItems = '';

    // Операции со строками (первый столбец / любая ячейка может добавить строку)
    if (isCorner) {
        menuItems += `
            <div class="horae-context-menu-item" data-action="add-row-below"><i class="fa-solid fa-plus"></i> Добавить строку</div>
            <div class="horae-context-menu-item" data-action="add-col-right"><i class="fa-solid fa-plus"></i> Добавить столбец</div>
        `;
    } else if (isColHeader) {
        const colLocked = lockedCols.has(col);
        menuItems += `
            <div class="horae-context-menu-item" data-action="add-col-left"><i class="fa-solid fa-arrow-left"></i> Добавить столбец слева</div>
            <div class="horae-context-menu-item" data-action="add-col-right"><i class="fa-solid fa-arrow-right"></i> Добавить столбец справа</div>
            <div class="horae-context-menu-divider"></div>
            <div class="horae-context-menu-item" data-action="toggle-lock-col"><i class="fa-solid ${colLocked ? 'fa-lock-open' : 'fa-lock'}"></i> ${colLocked ? 'Разблокировать столбец' : 'Заблокировать столбец'}</div>
            <div class="horae-context-menu-divider"></div>
            <div class="horae-context-menu-item danger" data-action="delete-col"><i class="fa-solid fa-trash-can"></i> Удалить столбец</div>
        `;
    } else if (isRowHeader) {
        const rowLocked = lockedRows.has(row);
        menuItems += `
            <div class="horae-context-menu-item" data-action="add-row-above"><i class="fa-solid fa-arrow-up"></i> Добавить строку выше</div>
            <div class="horae-context-menu-item" data-action="add-row-below"><i class="fa-solid fa-arrow-down"></i> Добавить строку ниже</div>
            <div class="horae-context-menu-divider"></div>
            <div class="horae-context-menu-item" data-action="toggle-lock-row"><i class="fa-solid ${rowLocked ? 'fa-lock-open' : 'fa-lock'}"></i> ${rowLocked ? 'Разблокировать строку' : 'Заблокировать строку'}</div>
            <div class="horae-context-menu-divider"></div>
            <div class="horae-context-menu-item danger" data-action="delete-row"><i class="fa-solid fa-trash-can"></i> Удалить строку</div>
        `;
    } else {
        // Обычная ячейка с данными
        menuItems += `
            <div class="horae-context-menu-item" data-action="add-row-above"><i class="fa-solid fa-arrow-up"></i> Добавить строку выше</div>
            <div class="horae-context-menu-item" data-action="add-row-below"><i class="fa-solid fa-arrow-down"></i> Добавить строку ниже</div>
            <div class="horae-context-menu-item" data-action="add-col-left"><i class="fa-solid fa-arrow-left"></i> Добавить столбец слева</div>
            <div class="horae-context-menu-item" data-action="add-col-right"><i class="fa-solid fa-arrow-right"></i> Добавить столбец справа</div>
        `;
    }

    // Все не угловые ячейки можно заблокировать/разблокировать
    if (!isCorner) {
        const cellLocked = lockedCells.has(cellKey);
        menuItems += `
            <div class="horae-context-menu-divider"></div>
            <div class="horae-context-menu-item" data-action="toggle-lock-cell"><i class="fa-solid ${cellLocked ? 'fa-lock-open' : 'fa-lock'}"></i> ${cellLocked ? 'Разблокировать ячейку' : 'Заблокировать ячейку'}</div>
        `;
    }
    
    const menu = document.createElement('div');
    menu.className = 'horae-context-menu';
    if (isLightMode()) menu.classList.add('horae-light');
    menu.innerHTML = menuItems;
    
    // Получить позицию
    const x = e.clientX || e.touches?.[0]?.clientX || 100;
    const y = e.clientY || e.touches?.[0]?.clientY || 100;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    
    document.body.appendChild(menu);
    activeContextMenu = menu;
    
    // Убедиться, что меню не выходит за пределы экрана
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 10}px`;
    }
    
    // Привязать клик по пункту меню — выполнить действие и закрыть
    menu.querySelectorAll('.horae-context-menu-item').forEach(item => {
        item.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            const action = item.dataset.action;
            hideContextMenu();
            setTimeout(() => {
                executeTableAction(tableIndex, row, col, action, scope);
            }, 10);
        });
        
        item.addEventListener('touchend', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            const action = item.dataset.action;
            hideContextMenu();
            setTimeout(() => {
                executeTableAction(tableIndex, row, col, action, scope);
            }, 10);
        });
    });
    
    ['click', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach(eventType => {
        menu.addEventListener(eventType, (ev) => {
            ev.stopPropagation();
            ev.stopImmediatePropagation();
        });
    });
    
    // Отложенная привязка, чтобы текущее событие не сработало
    setTimeout(() => {
        contextMenuCloseHandler = (ev) => {
            if (activeContextMenu && !activeContextMenu.contains(ev.target)) {
                hideContextMenu();
            }
        };
        document.addEventListener('click', contextMenuCloseHandler, true);
        document.addEventListener('touchstart', contextMenuCloseHandler, true);
    }, 50);
    
    e.preventDefault();
    e.stopPropagation();
}

/**
 * Скрыть контекстное меню
 */
function hideContextMenu() {
    if (contextMenuCloseHandler) {
        document.removeEventListener('click', contextMenuCloseHandler, true);
        document.removeEventListener('touchstart', contextMenuCloseHandler, true);
        contextMenuCloseHandler = null;
    }
    
    if (activeContextMenu) {
        activeContextMenu.remove();
        activeContextMenu = null;
    }
}

/**
 * Выполнение действий с таблицей
 */
function executeTableAction(tableIndex, row, col, action, scope = 'local') {
    pushTableSnapshot(scope, tableIndex);
    // Сначала записать незафиксированные значения из DOM, чтобы не потерять редактируемые данные
    const container = document.querySelector(`.horae-excel-table-container[data-table-index="${tableIndex}"][data-scope="${scope}"]`);
    if (container) {
        const tbl = getTablesByScope(scope)[tableIndex];
        if (tbl) {
            if (!tbl.data) tbl.data = {};
            container.querySelectorAll('.horae-excel-table input[data-table]').forEach(inp => {
                const r = parseInt(inp.dataset.row);
                const c = parseInt(inp.dataset.col);
                tbl.data[`${r}-${c}`] = inp.value;
            });
        }
    }

    const tables = getTablesByScope(scope);
    const table = tables[tableIndex];
    if (!table) return;

    const oldRows = table.rows || 2;
    const oldCols = table.cols || 2;
    const oldData = table.data || {};
    const newData = {};

    switch (action) {
        case 'add-row-above':
            table.rows = oldRows + 1;
            for (const [key, val] of Object.entries(oldData)) {
                const [r, c] = key.split('-').map(Number);
                newData[`${r >= row ? r + 1 : r}-${c}`] = val;
            }
            table.data = newData;
            break;

        case 'add-row-below':
            table.rows = oldRows + 1;
            for (const [key, val] of Object.entries(oldData)) {
                const [r, c] = key.split('-').map(Number);
                newData[`${r > row ? r + 1 : r}-${c}`] = val;
            }
            table.data = newData;
            break;

        case 'add-col-left':
            table.cols = oldCols + 1;
            for (const [key, val] of Object.entries(oldData)) {
                const [r, c] = key.split('-').map(Number);
                newData[`${r}-${c >= col ? c + 1 : c}`] = val;
            }
            table.data = newData;
            break;

        case 'add-col-right':
            table.cols = oldCols + 1;
            for (const [key, val] of Object.entries(oldData)) {
                const [r, c] = key.split('-').map(Number);
                newData[`${r}-${c > col ? c + 1 : c}`] = val;
            }
            table.data = newData;
            break;

        case 'delete-row':
            if (oldRows <= 2) { showToast('В таблице должно быть минимум 2 строки', 'warning'); return; }
            table.rows = oldRows - 1;
            for (const [key, val] of Object.entries(oldData)) {
                const [r, c] = key.split('-').map(Number);
                if (r === row) continue;
                newData[`${r > row ? r - 1 : r}-${c}`] = val;
            }
            table.data = newData;
            purgeTableContributions((table.name || '').trim(), scope);
            break;

        case 'delete-col':
            if (oldCols <= 2) { showToast('В таблице должно быть минимум 2 столбца', 'warning'); return; }
            table.cols = oldCols - 1;
            for (const [key, val] of Object.entries(oldData)) {
                const [r, c] = key.split('-').map(Number);
                if (c === col) continue;
                newData[`${r}-${c > col ? c - 1 : c}`] = val;
            }
            table.data = newData;
            purgeTableContributions((table.name || '').trim(), scope);
            break;

        case 'toggle-lock-row': {
            if (!table.lockedRows) table.lockedRows = [];
            const idx = table.lockedRows.indexOf(row);
            if (idx >= 0) {
                table.lockedRows.splice(idx, 1);
                showToast(`Строка ${row + 1} разблокирована`, 'info');
            } else {
                table.lockedRows.push(row);
                showToast(`Строка ${row + 1} заблокирована (ИИ не может редактировать)`, 'success');
            }
            break;
        }

        case 'toggle-lock-col': {
            if (!table.lockedCols) table.lockedCols = [];
            const idx = table.lockedCols.indexOf(col);
            if (idx >= 0) {
                table.lockedCols.splice(idx, 1);
                showToast(`Столбец ${col + 1} разблокирован`, 'info');
            } else {
                table.lockedCols.push(col);
                showToast(`Столбец ${col + 1} заблокирован (ИИ не может редактировать)`, 'success');
            }
            break;
        }

        case 'toggle-lock-cell': {
            if (!table.lockedCells) table.lockedCells = [];
            const cellKey = `${row}-${col}`;
            const idx = table.lockedCells.indexOf(cellKey);
            if (idx >= 0) {
                table.lockedCells.splice(idx, 1);
                showToast(`Ячейка [${row},${col}] разблокирована`, 'info');
            } else {
                table.lockedCells.push(cellKey);
                showToast(`Ячейка [${row},${col}] заблокирована (ИИ не может редактировать)`, 'success');
            }
            break;
        }
    }

    setTablesByScope(scope, tables);
    renderCustomTablesList();
}

/**
 * Добавить новую таблицу 2x2
 */
function addNewExcelTable(scope = 'local') {
    const tables = getTablesByScope(scope);

    tables.push({
        id: Date.now().toString(),
        name: '',
        rows: 2,
        cols: 2,
        data: {},
        baseData: {},
        baseRows: 2,
        baseCols: 2,
        prompt: '',
        lockedRows: [],
        lockedCols: [],
        lockedCells: []
    });

    setTablesByScope(scope, tables);
    renderCustomTablesList();
    showToast(scope === 'global' ? 'Глобальная таблица добавлена' : 'Локальная таблица добавлена', 'success');
}

/**
 * Удалить таблицу
 */
function deleteCustomTable(index, scope = 'local') {
    if (!confirm('Удалить эту таблицу?')) return;
    pushTableSnapshot(scope, index);

    const tables = getTablesByScope(scope);
    const deletedTable = tables[index];
    const deletedName = (deletedTable?.name || '').trim();
    tables.splice(index, 1);
    setTablesByScope(scope, tables);

    // Очистить tableContributions, ссылающиеся на это имя таблицы, во всех сообщениях
    const chat = horaeManager.getChat();
    if (deletedName) {
        for (let i = 0; i < chat.length; i++) {
            const meta = chat[i]?.horae_meta;
            if (meta?.tableContributions) {
                meta.tableContributions = meta.tableContributions.filter(
                    tc => (tc.name || '').trim() !== deletedName
                );
                if (meta.tableContributions.length === 0) {
                    delete meta.tableContributions;
                }
            }
        }
    }

    // Глобальная таблица: очистить per-card overlay
    if (scope === 'global' && deletedName && chat?.[0]?.horae_meta?.globalTableData) {
        delete chat[0].horae_meta.globalTableData[deletedName];
    }

    horaeManager.rebuildTableData();
    getContext().saveChat();
    renderCustomTablesList();
    showToast('Таблица удалена', 'info');
}

/** Очистить все tableContributions указанной таблицы, записать текущие данные в baseData как новую базу */
function purgeTableContributions(tableName, scope = 'local') {
    if (!tableName) return;
    const chat = horaeManager.getChat();
    if (!chat?.length) return;

    // Очистить все tableContributions данной таблицы во всех сообщениях (вклад ИИ + старые снимки пользователя)
    for (let i = 0; i < chat.length; i++) {
        const meta = chat[i]?.horae_meta;
        if (meta?.tableContributions) {
            meta.tableContributions = meta.tableContributions.filter(
                tc => (tc.name || '').trim() !== tableName
            );
            if (meta.tableContributions.length === 0) {
                delete meta.tableContributions;
            }
        }
    }

    // Записать текущие полные данные (включая правки пользователя) в baseData как новую базу
    // Так rebuildTableData сможет восстановиться с правильной базы, даже если сообщения были перегенерированы
    const tables = getTablesByScope(scope);
    const table = tables.find(t => (t.name || '').trim() === tableName);
    if (table) {
        table.baseData = JSON.parse(JSON.stringify(table.data || {}));
        table.baseRows = table.rows;
        table.baseCols = table.cols;
    }
    if (scope === 'global' && chat[0]?.horae_meta?.globalTableData?.[tableName]) {
        const overlay = chat[0].horae_meta.globalTableData[tableName];
        overlay.baseData = JSON.parse(JSON.stringify(overlay.data || {}));
        overlay.baseRows = overlay.rows;
        overlay.baseCols = overlay.cols;
    }
}

/** Очистить область данных таблицы (сохранить заголовки строки 0 и столбца 0) */
function clearTableData(index, scope = 'local') {
    if (!confirm('Очистить область данных этой таблицы? Заголовки будут сохранены.\n\nОдновременно будут удалены исторические записи ИИ, чтобы предотвратить возврат старых данных.')) return;
    pushTableSnapshot(scope, index);

    const tables = getTablesByScope(scope);
    if (!tables[index]) return;
    const table = tables[index];
    const data = table.data || {};
    const tableName = (table.name || '').trim();

    // Удалить данные всех ячеек с row>0 и col>0
    for (const key of Object.keys(data)) {
        const [r, c] = key.split('-').map(Number);
        if (r > 0 && c > 0) {
            delete data[key];
        }
    }

    table.data = data;

    // Синхронно обновить baseData (очистить область данных, сохранить заголовки)
    if (table.baseData) {
        for (const key of Object.keys(table.baseData)) {
            const [r, c] = key.split('-').map(Number);
            if (r > 0 && c > 0) {
                delete table.baseData[key];
            }
        }
    }

    // Очистить tableContributions данной таблицы во всех сообщениях (предотвратить воспроизведение старых данных при rebuildTableData)
    const chat = horaeManager.getChat();
    if (tableName) {
        for (let i = 0; i < chat.length; i++) {
            const meta = chat[i]?.horae_meta;
            if (meta?.tableContributions) {
                meta.tableContributions = meta.tableContributions.filter(
                    tc => (tc.name || '').trim() !== tableName
                );
                if (meta.tableContributions.length === 0) {
                    delete meta.tableContributions;
                }
            }
        }
    }

    // Глобальная таблица: синхронно очистить область данных и baseData в per-card overlay
    if (scope === 'global' && tableName && chat?.[0]?.horae_meta?.globalTableData?.[tableName]) {
        const overlay = chat[0].horae_meta.globalTableData[tableName];
        // Очистить область данных overlay.data
        for (const key of Object.keys(overlay.data || {})) {
            const [r, c] = key.split('-').map(Number);
            if (r > 0 && c > 0) delete overlay.data[key];
        }
        // Очистить область данных overlay.baseData
        if (overlay.baseData) {
            for (const key of Object.keys(overlay.baseData)) {
                const [r, c] = key.split('-').map(Number);
                if (r > 0 && c > 0) delete overlay.baseData[key];
            }
        }
    }

    setTablesByScope(scope, tables);
    horaeManager.rebuildTableData();
    getContext().saveChat();
    renderCustomTablesList();
    showToast('Данные таблицы очищены', 'info');
}

/** Переключить таблицу между глобальной/локальной областью */
function toggleTableScope(tableIndex, currentScope) {
    const newScope = currentScope === 'global' ? 'local' : 'global';
    const label = newScope === 'global' ? 'глобальную (общую для всех диалогов, данные независимы по карточкам)' : 'локальную (только для текущего диалога)';
    if (!confirm(`Преобразовать эту таблицу в ${label}?`)) return;
    pushTableSnapshot(currentScope, tableIndex);

    const srcTables = getTablesByScope(currentScope);
    if (!srcTables[tableIndex]) return;
    const table = JSON.parse(JSON.stringify(srcTables[tableIndex]));
    const tableName = (table.name || '').trim();

    // При преобразовании из глобальной в локальную очистить старый per-card overlay
    if (currentScope === 'global' && tableName) {
        const chat = horaeManager.getChat();
        if (chat?.[0]?.horae_meta?.globalTableData) {
            delete chat[0].horae_meta.globalTableData[tableName];
        }
    }

    // Удалить из исходного списка
    srcTables.splice(tableIndex, 1);
    setTablesByScope(currentScope, srcTables);

    // Добавить в целевой список
    const dstTables = getTablesByScope(newScope);
    dstTables.push(table);
    setTablesByScope(newScope, dstTables);

    renderCustomTablesList();
    getContext().saveChat();
    showToast(`Таблица преобразована в ${label}`, 'success');
}


/**
 * Привязать события списка предметов
 */
function bindItemsEvents() {
    const items = document.querySelectorAll('#horae-items-full-list .horae-full-item');
    
    items.forEach(item => {
        const itemName = item.dataset.itemName;
        if (!itemName) return;
        
        // Долгое нажатие для входа в режим множественного выбора
        item.addEventListener('mousedown', (e) => startLongPress(e, itemName));
        item.addEventListener('touchstart', (e) => startLongPress(e, itemName), { passive: true });
        item.addEventListener('mouseup', cancelLongPress);
        item.addEventListener('mouseleave', cancelLongPress);
        item.addEventListener('touchend', cancelLongPress);
        item.addEventListener('touchcancel', cancelLongPress);
        
        // В режиме выбора клик переключает выбор
        item.addEventListener('click', () => {
            if (itemsMultiSelectMode) {
                toggleItemSelection(itemName);
            }
        });
    });
}

/**
 * Начать таймер долгого нажатия
 */
function startLongPress(e, itemName) {
    if (itemsMultiSelectMode) return; // Уже в режиме множественного выбора
    
    longPressTimer = setTimeout(() => {
        enterMultiSelectMode(itemName);
    }, 800); // 800ms для длинного нажатия (увеличено для предотвращения случайных срабатываний)
}

/**
 * Отменить долгое нажатие
 */
function cancelLongPress() {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

/**
 * Войти в режим множественного выбора
 */
function enterMultiSelectMode(initialItem) {
    itemsMultiSelectMode = true;
    selectedItems.clear();
    if (initialItem) {
        selectedItems.add(initialItem);
    }
    
    // Показать панель множественного выбора
    const bar = document.getElementById('horae-items-multiselect-bar');
    if (bar) bar.style.display = 'flex';
    
    // Скрыть подсказку
    const hint = document.querySelector('#horae-tab-items .horae-items-hint');
    if (hint) hint.style.display = 'none';
    
    updateItemsDisplay();
    updateSelectedCount();
    
    showToast('Активирован режим множественного выбора', 'info');
}

/**
 * Выйти из режима множественного выбора
 */
function exitMultiSelectMode() {
    itemsMultiSelectMode = false;
    selectedItems.clear();
    
    // Скрыть панель множественного выбора
    const bar = document.getElementById('horae-items-multiselect-bar');
    if (bar) bar.style.display = 'none';
    
    // Показать подсказку
    const hint = document.querySelector('#horae-tab-items .horae-items-hint');
    if (hint) hint.style.display = 'block';
    
    updateItemsDisplay();
}

/**
 * Переключить состояние выбора предмета
 */
function toggleItemSelection(itemName) {
    if (selectedItems.has(itemName)) {
        selectedItems.delete(itemName);
    } else {
        selectedItems.add(itemName);
    }
    
    // Обновить UI
    const item = document.querySelector(`#horae-items-full-list .horae-full-item[data-item-name="${itemName}"]`);
    if (item) {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = selectedItems.has(itemName);
        item.classList.toggle('selected', selectedItems.has(itemName));
    }
    
    updateSelectedCount();
}

/**
 * Выбрать все предметы
 */
function selectAllItems() {
    const items = document.querySelectorAll('#horae-items-full-list .horae-full-item');
    items.forEach(item => {
        const name = item.dataset.itemName;
        if (name) selectedItems.add(name);
    });
    updateItemsDisplay();
    updateSelectedCount();
}

/**
 * Обновить отображение количества выбранных
 */
function updateSelectedCount() {
    const countEl = document.getElementById('horae-items-selected-count');
    if (countEl) countEl.textContent = selectedItems.size;
}

/**
 * Удалить выбранные предметы
 */
async function deleteSelectedItems() {
    if (selectedItems.size === 0) {
        showToast('Не выбрано ни одного предмета', 'warning');
        return;
    }
    
    // Диалог подтверждения
    const confirmed = confirm(`Удалить выбранные ${selectedItems.size} предмет(а/ов)?\n\nЭто действие удалит предметы из всей истории необратимо.`);
    if (!confirmed) return;
    
    // Удалить эти предметы из meta всех сообщений
    const chat = horaeManager.getChat();
    const itemsToDelete = Array.from(selectedItems);
    
    for (let i = 0; i < chat.length; i++) {
        const meta = chat[i].horae_meta;
        if (meta && meta.items) {
            let changed = false;
            for (const itemName of itemsToDelete) {
                if (meta.items[itemName]) {
                    delete meta.items[itemName];
                    changed = true;
                }
            }
            if (changed) injectHoraeTagToMessage(i, meta);
        }
    }
    
    // Сохранить изменения
    await getContext().saveChat();
    
    showToast(`Удалено ${itemsToDelete.length} предмет(а/ов)`, 'success');
    
    exitMultiSelectMode();
    updateStatusDisplay();
}

// ============================================
// Режим множественного выбора NPC
// ============================================

function enterNpcMultiSelect(initialName) {
    npcMultiSelectMode = true;
    selectedNpcs.clear();
    if (initialName) selectedNpcs.add(initialName);
    const bar = document.getElementById('horae-npc-multiselect-bar');
    if (bar) bar.style.display = 'flex';
    const btn = document.getElementById('horae-btn-npc-multiselect');
    if (btn) { btn.classList.add('active'); btn.title = 'Выйти из режима выбора'; }
    updateCharactersDisplay();
    _updateNpcSelectedCount();
}

function exitNpcMultiSelect() {
    npcMultiSelectMode = false;
    selectedNpcs.clear();
    const bar = document.getElementById('horae-npc-multiselect-bar');
    if (bar) bar.style.display = 'none';
    const btn = document.getElementById('horae-btn-npc-multiselect');
    if (btn) { btn.classList.remove('active'); btn.title = 'Режим выбора'; }
    updateCharactersDisplay();
}

function toggleNpcSelection(name) {
    if (selectedNpcs.has(name)) selectedNpcs.delete(name);
    else selectedNpcs.add(name);
    const item = document.querySelector(`#horae-npc-list .horae-npc-item[data-npc-name="${name}"]`);
    if (item) {
        const cb = item.querySelector('.horae-npc-select-cb input');
        if (cb) cb.checked = selectedNpcs.has(name);
        item.classList.toggle('selected', selectedNpcs.has(name));
    }
    _updateNpcSelectedCount();
}

function _updateNpcSelectedCount() {
    const el = document.getElementById('horae-npc-selected-count');
    if (el) el.textContent = selectedNpcs.size;
}

async function deleteSelectedNpcs() {
    if (selectedNpcs.size === 0) { showToast('Не выбрано ни одного персонажа', 'warning'); return; }
    if (!confirm(`Удалить выбранных ${selectedNpcs.size} персонаж(а/ей)?\n\nЭто удалит информацию из всей истории (включая расположение, связи, RPG-данные) необратимо.`)) return;
    
    _cascadeDeleteNpcs(Array.from(selectedNpcs));
    await getContext().saveChat();
    showToast(`Удалено ${selectedNpcs.size} персонаж(а/ей)`, 'success');
    exitNpcMultiSelect();
    refreshAllDisplays();
}

// Сопоставление аномальных состояний с иконками FontAwesome
const RPG_STATUS_ICONS = {
    '昏': 'fa-dizzy', '眩': 'fa-dizzy', '晕': 'fa-dizzy',
    '流血': 'fa-droplet', '出血': 'fa-droplet', '血': 'fa-droplet',
    '重伤': 'fa-heart-crack', '重傷': 'fa-heart-crack', '濒死': 'fa-heart-crack',
    '冻': 'fa-snowflake', '冰': 'fa-snowflake', '寒': 'fa-snowflake',
    '石化': 'fa-gem', '钙化': 'fa-gem', '结晶': 'fa-gem',
    '毒': 'fa-skull-crossbones', '腐蚀': 'fa-skull-crossbones',
    '火': 'fa-fire', '烧': 'fa-fire', '灼': 'fa-fire', '燃': 'fa-fire', '炎': 'fa-fire',
    '慢': 'fa-hourglass-half', '减速': 'fa-hourglass-half', '迟缓': 'fa-hourglass-half',
    '盲': 'fa-eye-slash', '失明': 'fa-eye-slash',
    '沉默': 'fa-comment-slash', '禁言': 'fa-comment-slash', '封印': 'fa-ban',
    '麻': 'fa-bolt', '痹': 'fa-bolt', '电': 'fa-bolt', '雷': 'fa-bolt',
    '弱': 'fa-feather', '衰': 'fa-feather', '虚': 'fa-feather',
    '恐': 'fa-ghost', '惧': 'fa-ghost', '惊': 'fa-ghost',
    '乱': 'fa-shuffle', '混乱': 'fa-shuffle', '狂暴': 'fa-shuffle',
    '眠': 'fa-moon', '睡': 'fa-moon', '催眠': 'fa-moon',
    '缚': 'fa-link', '禁锢': 'fa-link', '束': 'fa-link',
    '饥': 'fa-utensils', '饿': 'fa-utensils', '饥饿': 'fa-utensils',
    '渴': 'fa-glass-water', '脱水': 'fa-glass-water',
    '疲': 'fa-battery-quarter', '累': 'fa-battery-quarter', '倦': 'fa-battery-quarter', '乏': 'fa-battery-quarter',
    '伤': 'fa-bandage', '创': 'fa-bandage',
    '愈': 'fa-heart-pulse', '恢复': 'fa-heart-pulse', '再生': 'fa-heart-pulse',
    '隐': 'fa-user-secret', '伪装': 'fa-user-secret', '潜行': 'fa-user-secret',
    '护盾': 'fa-shield', '防御': 'fa-shield', '铁壁': 'fa-shield',
    '正常': 'fa-circle-check',
};

/** Подобрать иконку по тексту аномального состояния */
function getStatusIcon(text) {
    for (const [kw, icon] of Object.entries(RPG_STATUS_ICONS)) {
        if (text.includes(kw)) return icon;
    }
    return 'fa-triangle-exclamation';
}

/** Получить цвет полосы атрибута из настроек */
function getRpgBarColor(key) {
    const cfg = (settings.rpgBarConfig || []).find(b => b.key === key);
    return cfg?.color || '#6366f1';
}

/** Получить отображаемое имя полосы атрибута из настроек */
function getRpgBarName(key, aiLabel) {
    if (aiLabel) return aiLabel;
    const cfg = (settings.rpgBarConfig || []).find(b => b.key === key);
    return cfg?.name || key.toUpperCase();
}

// ============================================
// RPG система кубиков
// ============================================

const RPG_DICE_TYPES = [
    { faces: 4,   label: 'D4' },
    { faces: 6,   label: 'D6' },
    { faces: 8,   label: 'D8' },
    { faces: 10,  label: 'D10' },
    { faces: 12,  label: 'D12' },
    { faces: 20,  label: 'D20' },
    { faces: 100, label: 'D100' },
];

function rollDice(count, faces, modifier = 0) {
    const rolls = [];
    for (let i = 0; i < count; i++) rolls.push(Math.ceil(Math.random() * faces));
    const sum = rolls.reduce((a, b) => a + b, 0) + modifier;
    const modStr = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : '';
    return {
        notation: `${count}d${faces}${modStr}`,
        rolls,
        total: sum,
        display: `🎲 ${count}d${faces}${modStr} = [${rolls.join(', ')}]${modStr} = ${sum}`,
    };
}

function injectDiceToChat(text) {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;
    const cur = textarea.value;
    textarea.value = cur ? `${cur}\n${text}` : text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
}

let _diceAbort = null;
function renderDicePanel() {
    if (_diceAbort) { _diceAbort.abort(); _diceAbort = null; }
    const existing = document.getElementById('horae-rpg-dice-panel');
    if (existing) existing.remove();
    if (!settings.rpgMode || !settings.rpgDiceEnabled) return;

    _diceAbort = new AbortController();
    const sig = _diceAbort.signal;

    const btns = RPG_DICE_TYPES.map(d =>
        `<button class="horae-rpg-dice-btn" data-faces="${d.faces}">${d.label}</button>`
    ).join('');

    const html = `
        <div id="horae-rpg-dice-panel" class="horae-rpg-dice-panel">
            <div class="horae-rpg-dice-toggle" title="Панель кубиков (можно перетаскивать)">
                <i class="fa-solid fa-dice-d20"></i>
            </div>
            <div class="horae-rpg-dice-body" style="display:none;">
                <div class="horae-rpg-dice-types">${btns}</div>
                <div class="horae-rpg-dice-config">
                    <label>Количество<input type="number" id="horae-dice-count" value="1" min="1" max="20" class="horae-rpg-dice-input"></label>
                    <label>Бонус<input type="number" id="horae-dice-mod" value="0" min="-99" max="99" class="horae-rpg-dice-input"></label>
                </div>
                <div class="horae-rpg-dice-result" id="horae-dice-result"></div>
                <button id="horae-dice-inject" class="horae-rpg-dice-inject" style="display:none;">
                    <i class="fa-solid fa-paper-plane"></i> Вставить в чат
                </button>
            </div>
        </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    document.body.appendChild(wrapper.firstChild);

    const panel = document.getElementById('horae-rpg-dice-panel');
    if (!panel) return;

    _applyDicePos(panel);

    let lastResult = null;
    let selectedFaces = 20;

    // ---- Логика перетаскивания (поддерживает mouse + touch) ----
    const toggle = panel.querySelector('.horae-rpg-dice-toggle');
    let dragging = false, dragMoved = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;

    function onDragStart(e) {
        const ev = e.touches ? e.touches[0] : e;
        dragging = true; dragMoved = false;
        startX = ev.clientX; startY = ev.clientY;
        const rect = panel.getBoundingClientRect();
        origLeft = rect.left; origTop = rect.top;
        panel.style.transition = 'none';
    }
    function onDragMove(e) {
        if (!dragging) return;
        const ev = e.touches ? e.touches[0] : e;
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (!dragMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            dragMoved = true;
            // При первом движении удаляет центрирующий transform и переходит на абсолютные пиксельные координаты
            if (!panel.classList.contains('horae-dice-placed')) {
                panel.style.left = origLeft + 'px';
                panel.style.top = origTop + 'px';
                panel.classList.add('horae-dice-placed');
            }
        }
        if (!dragMoved) return;
        e.preventDefault();
        let nx = origLeft + dx, ny = origTop + dy;
        const vw = window.innerWidth, vh = window.innerHeight;
        nx = Math.max(0, Math.min(nx, vw - 48));
        ny = Math.max(0, Math.min(ny, vh - 48));
        panel.style.left = nx + 'px';
        panel.style.top = ny + 'px';
    }
    function onDragEnd() {
        if (!dragging) return;
        dragging = false;
        panel.style.transition = '';
        if (dragMoved) {
            panel.classList.add('horae-dice-placed');
            settings.dicePosX = parseInt(panel.style.left);
            settings.dicePosY = parseInt(panel.style.top);
            panel.classList.toggle('horae-dice-flip-down', settings.dicePosY < 300);
            saveSettings();
        }
    }
    toggle.addEventListener('mousedown', onDragStart, { signal: sig });
    document.addEventListener('mousemove', onDragMove, { signal: sig });
    document.addEventListener('mouseup', onDragEnd, { signal: sig });
    toggle.addEventListener('touchstart', onDragStart, { passive: false, signal: sig });
    document.addEventListener('touchmove', onDragMove, { passive: false, signal: sig });
    document.addEventListener('touchend', onDragEnd, { signal: sig });

    // Клик для раскрытия/сворачивания (срабатывает только без перетаскивания)
    toggle.addEventListener('click', () => {
        if (dragMoved) return;
        const body = panel.querySelector('.horae-rpg-dice-body');
        body.style.display = body.style.display === 'none' ? '' : 'none';
    }, { signal: sig });

    panel.querySelectorAll('.horae-rpg-dice-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.faces) === selectedFaces);
        btn.addEventListener('click', () => {
            selectedFaces = parseInt(btn.dataset.faces);
            panel.querySelectorAll('.horae-rpg-dice-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const count = parseInt(document.getElementById('horae-dice-count')?.value) || 1;
            const mod = parseInt(document.getElementById('horae-dice-mod')?.value) || 0;
            lastResult = rollDice(count, selectedFaces, mod);
            const resultEl = document.getElementById('horae-dice-result');
            if (resultEl) resultEl.textContent = lastResult.display;
            const injectBtn = document.getElementById('horae-dice-inject');
            if (injectBtn) injectBtn.style.display = '';
        }, { signal: sig });
    });

    document.getElementById('horae-dice-inject')?.addEventListener('click', () => {
        if (lastResult) {
            injectDiceToChat(lastResult.display);
            showToast('Результат броска вставлен в чат', 'success');
        }
    }, { signal: sig });
}

/** Применить сохранённую позицию панели кубиков; автоматически сбросить, если координаты выходят за пределы видимой области */
function _applyDicePos(panel) {
    if (settings.dicePosX != null && settings.dicePosY != null) {
        const vw = window.innerWidth, vh = window.innerHeight;
        if (settings.dicePosX > vw || settings.dicePosY > vh) {
            settings.dicePosX = null;
            settings.dicePosY = null;
            return;
        }
        const x = Math.max(0, Math.min(settings.dicePosX, vw - 48));
        const y = Math.max(0, Math.min(settings.dicePosY, vh - 48));
        panel.style.left = x + 'px';
        panel.style.top = y + 'px';
        panel.classList.add('horae-dice-placed');
        panel.classList.toggle('horae-dice-flip-down', y < 300);
    }
}

/** Рендеринг списка конфигурации полос атрибутов */
function renderBarConfig() {
    const list = document.getElementById('horae-rpg-bar-config-list');
    if (!list) return;
    const bars = settings.rpgBarConfig || [];
    list.innerHTML = bars.map((b, i) => `
        <div class="horae-rpg-config-row" data-idx="${i}">
            <input class="horae-rpg-config-key" value="${escapeHtml(b.key)}" maxlength="10" data-idx="${i}" />
            <input class="horae-rpg-config-name" value="${escapeHtml(b.name)}" maxlength="8" data-idx="${i}" />
            <input type="color" class="horae-rpg-config-color" value="${b.color}" data-idx="${i}" />
            <button class="horae-rpg-config-del" data-idx="${i}" title="Удалить"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');
}

/** Построить опции выпадающего списка персонажей ({{user}} + список NPC) */
function buildCharacterOptions() {
    const userName = getContext().name1 || '{{user}}';
    let html = `<option value="__user__">${escapeHtml(userName)}</option>`;
    const state = horaeManager.getLatestState();
    for (const [name, info] of Object.entries(state.npcs || {})) {
        const prefix = info._id ? `N${info._id} ` : '';
        html += `<option value="${escapeHtml(name)}">${escapeHtml(prefix + name)}</option>`;
    }
    return html;
}

/** Рисовать радар-диаграмму на Canvas (адаптивный DPI) */
function drawRadarChart(canvas, values, config, maxVal = 100) {
    const n = config.length;
    if (n < 3) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = 260, cssH = 260;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const cx = cssW / 2, cy = cssH / 2;
    const pad = 38;
    const r = Math.min(cx, cy) - pad;
    ctx.clearRect(0, 0, cssW, cssH);

    const angle = i => -Math.PI / 2 + (2 * Math.PI * i) / n;

    // Фоновая сетка
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    for (let lv = 1; lv <= 4; lv++) {
        ctx.beginPath();
        const lr = (r * lv) / 4;
        for (let i = 0; i <= n; i++) {
            const a = angle(i % n);
            const x = cx + lr * Math.cos(a), y = cy + lr * Math.sin(a);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    // Радиальные линии
    for (let i = 0; i < n; i++) {
        const a = angle(i);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        ctx.stroke();
    }
    // Область данных
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
        const a = angle(i % n);
        const v = Math.min(maxVal, values[config[i % n].key] || 0);
        const dr = (v / maxVal) * r;
        const x = cx + dr * Math.cos(a), y = cy + dr * Math.sin(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.fillStyle = 'rgba(124, 58, 237, 0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(124, 58, 237, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Точки вершин + метки
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
        const a = angle(i);
        const v = Math.min(maxVal, values[config[i].key] || 0);
        const dr = (v / maxVal) * r;
        ctx.beginPath();
        ctx.arc(cx + dr * Math.cos(a), cy + dr * Math.sin(a), 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(124, 58, 237, 1)';
        ctx.fill();
        // Смещение меток адаптируется по количеству измерений
        const labelR = r + 22;
        const lx = cx + labelR * Math.cos(a);
        const ly = cy + labelR * Math.sin(a);
        ctx.fillStyle = '#e2e8f0';
        const cosA = Math.cos(a);
        ctx.textAlign = cosA < -0.1 ? 'right' : cosA > 0.1 ? 'left' : 'center';
        ctx.textBaseline = ly < cy - 5 ? 'bottom' : ly > cy + 5 ? 'top' : 'middle';
        ctx.fillText(`${config[i].name} ${v}`, lx, ly);
    }
}

/** Синхронизировать видимость вкладки RPG и всех подразделов */
function _syncRpgTabVisibility() {
    const sendBars = settings.rpgMode && settings.sendRpgBars !== false;
    const sendAttrs = settings.rpgMode && settings.sendRpgAttributes !== false;
    const sendSkills = settings.rpgMode && settings.sendRpgSkills !== false;
    const hasContent = sendBars || sendAttrs || sendSkills;
    $('#horae-tab-btn-rpg').toggle(hasContent);
    $('#horae-rpg-bar-config-area').toggle(sendBars);
    $('#horae-rpg-attr-config-area').toggle(sendAttrs);
    $('.horae-rpg-manual-section').toggle(sendAttrs);
    $('.horae-rpg-skills-area').toggle(sendSkills);
}

/** Обновить вкладку RPG (режим карточки персонажа, снимок по позиции текущего сообщения) */
function updateRpgDisplay() {
    if (!settings.rpgMode) return;
    const rpg = horaeManager.getRpgStateAt(0);
    const state = horaeManager.getLatestState();
    const container = document.getElementById('horae-tab-rpg');
    if (!container) return;

    const sendBars = settings.sendRpgBars !== false;
    const sendAttrs = settings.sendRpgAttributes !== false;
    const sendSkills = settings.sendRpgSkills !== false;
    const attrCfg = settings.rpgAttributeConfig || [];
    const hasAttrModule = sendAttrs && attrCfg.length > 0;
    const moduleCount = [sendBars, hasAttrModule, sendSkills].filter(Boolean).length;
    const useCardLayout = hasAttrModule || moduleCount >= 2;

    // Раздел конфигурации всегда рендерится
    renderBarConfig();
    renderAttrConfig();

    const barsSection = document.getElementById('horae-rpg-bars-section');
    const charCardsSection = document.getElementById('horae-rpg-char-cards');
    if (!barsSection || !charCardsSection) return;

    // Собрать всех персонажей
    const allNames = new Set([
        ...Object.keys(rpg.bars || {}),
        ...Object.keys(rpg.status || {}),
        ...Object.keys(rpg.skills || {}),
        ...Object.keys(rpg.attributes || {}),
    ]);

    if (useCardLayout) {
        // Режим карточки персонажа: полосы атрибутов + карточка в одном блоке, присутствующие персонажи в приоритете
        barsSection.style.display = '';

        // Классификация: присутствующие (есть bars или status) vs отсутствующие
        const inScene = [], offScene = [];
        for (const name of allNames) {
            const hasBars = rpg.bars[name] && Object.keys(rpg.bars[name]).length > 0;
            const hasStatus = (rpg.status?.[name] || []).length > 0;
            (hasBars || hasStatus ? inScene : offScene).push(name);
        }
        const sortedNames = [...inScene, ...offScene];

        let barsHtml = '';
        for (const name of sortedNames) {
            const bars = rpg.bars[name];
            const effects = rpg.status?.[name] || [];
            const npc = state.npcs[name];
            const profession = npc?.personality?.split(/[,，]/)?.[0]?.trim() || '';
            const attrs = rpg.attributes?.[name] || {};
            const skills = rpg.skills?.[name] || [];
            const isPresent = inScene.includes(name);

            // Контейнер персонажа
            barsHtml += `<div class="horae-rpg-char-block${isPresent ? '' : ' horae-rpg-offscene'}">`;

            // Полосы атрибутов (только присутствующие персонажи)
            if (isPresent && sendBars) {
                barsHtml += `<div class="horae-rpg-char-card horae-rpg-bar-card"><div class="horae-rpg-char-name">${escapeHtml(name)}`;
                for (const e of effects) {
                    barsHtml += ` <i class="fa-solid ${getStatusIcon(e)} horae-rpg-hud-effect" title="${escapeHtml(e)}"></i>`;
                }
                barsHtml += '</div>';
                if (bars) {
                    for (const [type, val] of Object.entries(bars)) {
                        const label = getRpgBarName(type, val[2]);
                        const cur = val[0], max = val[1];
                        const pct = max > 0 ? Math.min(100, Math.round(cur / max * 100)) : 0;
                        const color = getRpgBarColor(type);
                        barsHtml += `<div class="horae-rpg-bar"><span class="horae-rpg-bar-label">${escapeHtml(label)}</span><div class="horae-rpg-bar-track"><div class="horae-rpg-bar-fill" style="width:${pct}%;background:${color};"></div></div><span class="horae-rpg-bar-val">${cur}/${max}</span></div>`;
                    }
                }
                if (effects.length > 0) {
                    barsHtml += '<div class="horae-rpg-status-label">Список состояний</div><div class="horae-rpg-status-detail">';
                    for (const e of effects) barsHtml += `<div class="horae-rpg-status-item"><i class="fa-solid ${getStatusIcon(e)} horae-rpg-status-icon"></i><span>${escapeHtml(e)}</span></div>`;
                    barsHtml += '</div>';
                }
                barsHtml += '</div>';
            }

            // Свёрнутая карточка персонажа (атрибуты + навыки) сразу под полосами атрибутов
            const hasDetailContent = (sendAttrs && attrCfg.length > 0) || (sendSkills && skills.length > 0);
            if (hasDetailContent) {
                barsHtml += `<details class="horae-rpg-char-detail"><summary class="horae-rpg-char-summary"><span class="horae-rpg-char-detail-name">${escapeHtml(name)}</span>`;
                if (profession) barsHtml += `<span class="horae-rpg-char-prof">${escapeHtml(profession)}</span>`;
                barsHtml += '</summary><div class="horae-rpg-char-detail-body">';

                if (sendAttrs && attrCfg.length >= 3) {
                    const hasAttrs = Object.keys(attrs).length > 0;
                    const viewMode = settings.rpgAttrViewMode || 'radar';
                    barsHtml += '<div class="horae-rpg-attr-section">';
                    barsHtml += `<div class="horae-rpg-attr-header"><span>Атрибуты</span><button class="horae-rpg-charattr-edit" data-char="${escapeHtml(name)}" title="Редактировать атрибуты"><i class="fa-solid fa-pen-to-square"></i></button></div>`;
                    if (hasAttrs) {
                        if (viewMode === 'radar') {
                            barsHtml += `<canvas class="horae-rpg-radar" data-char="${escapeHtml(name)}" width="260" height="260"></canvas>`;
                        } else {
                            barsHtml += '<div class="horae-rpg-attr-text">';
                            for (const a of attrCfg) {
                                barsHtml += `<div class="horae-rpg-attr-row"><span>${escapeHtml(a.name)}</span><span>${attrs[a.key] ?? '?'}</span></div>`;
                            }
                            barsHtml += '</div>';
                        }
                    } else {
                        barsHtml += '<div class="horae-rpg-skills-empty">Нет данных атрибутов, нажмите ✎ для ручного ввода</div>';
                    }
                    barsHtml += '</div>';
                }

                if (sendSkills && skills.length > 0) {
                    barsHtml += '<div class="horae-rpg-card-skills">';
                    for (const sk of skills) {
                        barsHtml += `<details class="horae-rpg-skill-detail"><summary class="horae-rpg-skill-summary">${escapeHtml(sk.name)}`;
                        if (sk.level) barsHtml += ` <span class="horae-rpg-skill-lv">${escapeHtml(sk.level)}</span>`;
                        barsHtml += `<button class="horae-rpg-skill-del" data-owner="${escapeHtml(name)}" data-skill="${escapeHtml(sk.name)}" title="Удалить"><i class="fa-solid fa-xmark"></i></button></summary>`;
                        if (sk.desc) barsHtml += `<div class="horae-rpg-skill-desc">${escapeHtml(sk.desc)}</div>`;
                        barsHtml += '</details>';
                    }
                    barsHtml += '</div>';
                }
                barsHtml += '</div></details>';
            }
            barsHtml += '</div>';
        }
        barsSection.innerHTML = barsHtml;
        charCardsSection.innerHTML = '';
        charCardsSection.style.display = 'none';
    } else {
        // Плоский режим (только одна функция)
        charCardsSection.innerHTML = '';
        charCardsSection.style.display = 'none';
        let barsHtml = '';
        for (const name of allNames) {
            const bars = rpg.bars[name] || {};
            const effects = rpg.status?.[name] || [];
            if (!Object.keys(bars).length && !effects.length) continue;
            let h = `<div class="horae-rpg-char-card"><div class="horae-rpg-char-name">${escapeHtml(name)}</div>`;
            for (const [type, val] of Object.entries(bars)) {
                const label = getRpgBarName(type, val[2]);
                const cur = val[0], max = val[1];
                const pct = max > 0 ? Math.min(100, Math.round(cur / max * 100)) : 0;
                const color = getRpgBarColor(type);
                h += `<div class="horae-rpg-bar"><span class="horae-rpg-bar-label">${escapeHtml(label)}</span><div class="horae-rpg-bar-track"><div class="horae-rpg-bar-fill" style="width:${pct}%;background:${color};"></div></div><span class="horae-rpg-bar-val">${cur}/${max}</span></div>`;
            }
            if (effects.length > 0) {
                h += '<div class="horae-rpg-status-label">Список состояний</div><div class="horae-rpg-status-detail">';
                for (const e of effects) h += `<div class="horae-rpg-status-item"><i class="fa-solid ${getStatusIcon(e)} horae-rpg-status-icon"></i><span>${escapeHtml(e)}</span></div>`;
                h += '</div>';
            }
            h += '</div>';
            barsHtml += h;
        }
        barsSection.innerHTML = barsHtml;
    }

    // Плоский список навыков: скрывается в режиме карточки (навыки уже показаны свёрнуто в карточке)
    const skillsSection = document.getElementById('horae-rpg-skills-section');
    if (skillsSection) {
        if (useCardLayout && sendSkills) {
            skillsSection.innerHTML = '<div class="horae-rpg-skills-empty">Навыки уже показаны в карточке персонажа выше. Нажмите + для добавления вручную</div>';
        } else {
            const hasSkills = Object.values(rpg.skills).some(arr => arr?.length > 0);
            let skillsHtml = '';
            if (hasSkills) {
                for (const [name, skills] of Object.entries(rpg.skills)) {
                    if (!skills?.length) continue;
                    skillsHtml += `<div class="horae-rpg-skill-group"><div class="horae-rpg-char-name">${escapeHtml(name)}</div>`;
                    for (const sk of skills) {
                        const lv = sk.level ? `<span class="horae-rpg-skill-lv">${escapeHtml(sk.level)}</span>` : '';
                        const desc = sk.desc ? `<div class="horae-rpg-skill-desc">${escapeHtml(sk.desc)}</div>` : '';
                        skillsHtml += `<div class="horae-rpg-skill-card"><div class="horae-rpg-skill-header"><span class="horae-rpg-skill-name">${escapeHtml(sk.name)}</span>${lv}<button class="horae-rpg-skill-del" data-owner="${escapeHtml(name)}" data-skill="${escapeHtml(sk.name)}" title="Удалить"><i class="fa-solid fa-xmark"></i></button></div>${desc}</div>`;
                    }
                    skillsHtml += '</div>';
                }
            } else {
                skillsHtml = '<div class="horae-rpg-skills-empty">Нет навыков. Нажмите + для добавления вручную</div>';
            }
            skillsSection.innerHTML = skillsHtml;
        }
    }

    // Нарисовать радар-диаграмму
    document.querySelectorAll('.horae-rpg-radar').forEach(canvas => {
        const charName = canvas.dataset.char;
        const vals = rpg.attributes?.[charName] || {};
        drawRadarChart(canvas, vals, attrCfg);
    });

    updateAllRpgHuds();
}

/** Рендеринг списка конфигурации панели атрибутов */
function renderAttrConfig() {
    const list = document.getElementById('horae-rpg-attr-config-list');
    if (!list) return;
    const attrs = settings.rpgAttributeConfig || [];
    list.innerHTML = attrs.map((a, i) => `
        <div class="horae-rpg-config-row" data-idx="${i}">
            <input class="horae-rpg-config-key" value="${escapeHtml(a.key)}" maxlength="10" data-idx="${i}" data-type="attr" />
            <input class="horae-rpg-config-name" value="${escapeHtml(a.name)}" maxlength="8" data-idx="${i}" data-type="attr" />
            <input class="horae-rpg-attr-desc" value="${escapeHtml(a.desc || '')}" placeholder="Описание" data-idx="${i}" />
            <button class="horae-rpg-attr-del" data-idx="${i}" title="Удалить"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');
}

/** Рендеринг RPG HUD (простые полосы состояния) для одной панели сообщения */
function renderRpgHud(messageEl, messageIndex) {
    const old = messageEl.querySelector('.horae-rpg-hud');
    if (old) old.remove();
    if (!settings.rpgMode || settings.sendRpgBars === false) return;

    // Построить снимок RPG по позиции сообщения (пропустить последующие)
    const chatLen = horaeManager.getChat()?.length || 0;
    const skip = Math.max(0, chatLen - messageIndex - 1);
    const rpg = horaeManager.getRpgStateAt(skip);
    if (Object.keys(rpg.bars).length === 0 && Object.keys(rpg.status || {}).length === 0) return;

    const meta = horaeManager.getMessageMeta(messageIndex);
    const present = meta?.scene?.characters_present || [];
    if (present.length === 0) return;

    const state = horaeManager.getLatestState();
    const barCfg = settings.rpgBarConfig || [];
    const userName = getContext().name1 || '';

    // Отфильтровать присутствующих персонажей с данными RPG
    const chars = [];
    const allRpgNames = new Set([...Object.keys(rpg.bars), ...Object.keys(rpg.status || {})]);
    for (const p of present) {
        const n = p.trim();
        if (!n) continue;
        // Сопоставить имена в данных RPG (учитывая {{user}} / userName)
        let match = null;
        if (allRpgNames.has(n)) match = n;
        else if (n === userName && allRpgNames.has(userName)) match = userName;
        else {
            for (const rn of allRpgNames) {
                if (rn.includes(n) || n.includes(rn)) { match = rn; break; }
            }
        }
        if (match) chars.push(match);
    }
    if (chars.length === 0) return;

    let html = '<div class="horae-rpg-hud">';
    for (const name of chars) {
        const bars = rpg.bars[name] || {};
        const effects = rpg.status?.[name] || [];
        html += '<div class="horae-rpg-hud-row">';
        html += `<div class="horae-rpg-hud-name">${escapeHtml(name)}`;
        for (const e of effects) {
            html += ` <i class="fa-solid ${getStatusIcon(e)} horae-rpg-hud-effect" title="${escapeHtml(e)}"></i>`;
        }
        html += '</div><div class="horae-rpg-hud-bars">';
        for (const [type, val] of Object.entries(bars)) {
            const label = getRpgBarName(type, val[2]);
            const cur = val[0], max = val[1];
            const pct = max > 0 ? Math.min(100, Math.round(cur / max * 100)) : 0;
            const color = getRpgBarColor(type);
            html += `<div class="horae-rpg-hud-bar"><span class="horae-rpg-hud-lbl">${escapeHtml(label)}</span><div class="horae-rpg-hud-track"><div class="horae-rpg-hud-fill" style="width:${pct}%;background:${color};"></div></div><span class="horae-rpg-hud-val">${cur}/${max}</span></div>`;
        }
        html += '</div></div>';
    }
    html += '</div>';

    const panel = messageEl.querySelector('.horae-message-panel');
    if (panel) {
        panel.insertAdjacentHTML('beforebegin', html);
        const hudEl = messageEl.querySelector('.horae-rpg-hud');
        if (hudEl) {
            const w = Math.max(50, Math.min(100, settings.panelWidth || 100));
            if (w < 100) hudEl.style.maxWidth = `${w}%`;
            const ofs = Math.max(0, settings.panelOffset || 0);
            if (ofs > 0) hudEl.style.marginLeft = `${ofs}px`;
            if (isLightMode()) hudEl.classList.add('horae-light');
        }
    }
}

/** Обновить RPG HUD всех видимых панелей */
function updateAllRpgHuds() {
    if (!settings.rpgMode || settings.sendRpgBars === false) return;
    // Единый прямой проход для построения накопительного снимка RPG каждого сообщения
    const chat = horaeManager.getChat();
    if (!chat?.length) return;
    const snapMap = _buildRpgSnapshotMap(chat);
    document.querySelectorAll('.mes').forEach(mesEl => {
        const id = parseInt(mesEl.getAttribute('mesid'));
        if (!isNaN(id)) _renderRpgHudFromSnapshot(mesEl, id, snapMap.get(id));
    });
}

/** Единый проход для построения маппинга сообщение→снимок RPG */
function _buildRpgSnapshotMap(chat) {
    const map = new Map();
    const acc = { bars: {}, status: {}, skills: {}, attributes: {} };
    const resolve = (raw) => horaeManager._resolveRpgOwner(raw);
    for (let i = 0; i < chat.length; i++) {
        const changes = chat[i]?.horae_meta?._rpgChanges;
        if (changes && i > 0) {
            for (const [raw, bd] of Object.entries(changes.bars || {})) {
                const o = resolve(raw);
                if (!acc.bars[o]) acc.bars[o] = {};
                Object.assign(acc.bars[o], bd);
            }
            for (const [raw, ef] of Object.entries(changes.status || {})) {
                acc.status[resolve(raw)] = ef;
            }
            for (const sk of (changes.skills || [])) {
                const o = resolve(sk.owner);
                if (!acc.skills[o]) acc.skills[o] = [];
                const idx = acc.skills[o].findIndex(s => s.name === sk.name);
                if (idx >= 0) { if (sk.level) acc.skills[o][idx].level = sk.level; if (sk.desc) acc.skills[o][idx].desc = sk.desc; }
                else acc.skills[o].push({ name: sk.name, level: sk.level, desc: sk.desc });
            }
            for (const sk of (changes.removedSkills || [])) {
                const o = resolve(sk.owner);
                if (acc.skills[o]) acc.skills[o] = acc.skills[o].filter(s => s.name !== sk.name);
            }
            for (const [raw, vals] of Object.entries(changes.attributes || {})) {
                const o = resolve(raw);
                acc.attributes[o] = { ...(acc.attributes[o] || {}), ...vals };
            }
        }
        // Глубокое копирование текущего накопленного состояния как снимка
        map.set(i, JSON.parse(JSON.stringify(acc)));
    }
    return map;
}

/** Рендеринг RPG HUD одного сообщения с использованием предварительно построенного снимка */
function _renderRpgHudFromSnapshot(messageEl, messageIndex, rpg) {
    const old = messageEl.querySelector('.horae-rpg-hud');
    if (old) old.remove();
    if (!rpg || (Object.keys(rpg.bars).length === 0 && Object.keys(rpg.status || {}).length === 0)) return;

    const meta = horaeManager.getMessageMeta(messageIndex);
    const present = meta?.scene?.characters_present || [];
    if (present.length === 0) return;

    const state = horaeManager.getLatestState();
    const barCfg = settings.rpgBarConfig || [];
    const userName = getContext().name1 || '';
    const allRpgNames = new Set([...Object.keys(rpg.bars), ...Object.keys(rpg.status || {})]);
    const chars = [];
    for (const p of present) {
        const n = p.trim();
        if (!n) continue;
        let match = null;
        if (allRpgNames.has(n)) match = n;
        else if (n === userName && allRpgNames.has(userName)) match = userName;
        else {
            for (const rn of allRpgNames) {
                if (rn.includes(n) || n.includes(rn)) { match = rn; break; }
            }
        }
        if (match) chars.push(match);
    }
    if (chars.length === 0) return;

    let html = '<div class="horae-rpg-hud">';
    for (const name of chars) {
        const bars = rpg.bars[name] || {};
        const effects = rpg.status?.[name] || [];
        const displayName = name;
        html += `<div class="horae-rpg-hud-name">${escapeHtml(displayName)}`;
        for (const e of effects) html += ` <i class="fa-solid ${getStatusIcon(e)} horae-rpg-hud-effect" title="${escapeHtml(e)}"></i>`;
        html += '</div>';
        for (const [type, val] of Object.entries(bars)) {
            const label = getRpgBarName(type, val[2]);
            const cur = val[0], max = val[1];
            const pct = max > 0 ? Math.min(100, Math.round(cur / max * 100)) : 0;
            const color = getRpgBarColor(type);
            html += `<div class="horae-rpg-hud-bar"><span class="horae-rpg-hud-label">${escapeHtml(label)}</span><div class="horae-rpg-hud-track"><div class="horae-rpg-hud-fill" style="width:${pct}%;background:${color};"></div></div><span class="horae-rpg-hud-val">${cur}/${max}</span></div>`;
        }
    }
    html += '</div>';

    const panel = messageEl.querySelector('.horae-message-panel');
    if (panel) {
        panel.insertAdjacentHTML('beforebegin', html);
        const hudEl = messageEl.querySelector('.horae-rpg-hud');
        if (hudEl) {
            const w = Math.max(50, Math.min(100, settings.panelWidth || 100));
            if (w < 100) hudEl.style.maxWidth = `${w}%`;
            const ofs = Math.max(0, settings.panelOffset || 0);
            if (ofs > 0) hudEl.style.marginLeft = `${ofs}px`;
            if (isLightMode()) hudEl.classList.add('horae-light');
        }
    }
}

/**
 * Обновить все отображения
 */
function refreshAllDisplays() {
    updateStatusDisplay();
    updateAgendaDisplay();
    updateTimelineDisplay();
    updateCharactersDisplay();
    updateItemsDisplay();
    updateLocationMemoryDisplay();
    updateRpgDisplay();
    updateTokenCounter();
    enforceHiddenState();
}

/**
 * Извлечь метки сжатия сводки из событий сообщения (_compressedBy / _summaryId),
 * Используется для восстановления после сброса createEmptyMeta(), предотвращает утечку событий сводки из хронологии
 */
function _saveCompressedFlags(meta) {
    if (!meta?.events?.length) return null;
    const flags = [];
    for (const evt of meta.events) {
        if (evt._compressedBy || evt._summaryId) {
            flags.push({
                summary: evt.summary || '',
                _compressedBy: evt._compressedBy || null,
                _summaryId: evt._summaryId || null,
                isSummary: !!evt.isSummary,
            });
        }
    }
    return flags.length ? flags : null;
}

/**
 * Восстановить сохранённые метки сжатия в повторно разобранные события;
 * Если новых событий меньше, чем сохранённых меток, лишние события сводки добавляются обратно
 */
function _restoreCompressedFlags(meta, saved) {
    if (!saved?.length || !meta) return;
    if (!meta.events) meta.events = [];
    const nonSummaryFlags = saved.filter(f => !f.isSummary);
    const summaryFlags = saved.filter(f => f.isSummary);
    for (let i = 0; i < Math.min(nonSummaryFlags.length, meta.events.length); i++) {
        const evt = meta.events[i];
        if (evt.isSummary || evt._summaryId) continue;
        if (nonSummaryFlags[i]._compressedBy) {
            evt._compressedBy = nonSummaryFlags[i]._compressedBy;
        }
    }
    // Если количество несводочных событий не совпадает, принудительное сопоставление по summaryId
    if (nonSummaryFlags.length > 0 && meta.events.length > 0) {
        const chat = horaeManager.getChat();
        const sums = chat?.[0]?.horae_meta?.autoSummaries || [];
        const activeSumIds = new Set(sums.filter(s => s.active).map(s => s.id));
        for (const evt of meta.events) {
            if (evt.isSummary || evt._summaryId || evt._compressedBy) continue;
            const matchFlag = nonSummaryFlags.find(f => f._compressedBy && activeSumIds.has(f._compressedBy));
            if (matchFlag) evt._compressedBy = matchFlag._compressedBy;
        }
    }
    // Добавить события карточек сводок обратно (processAIResponse не разбирает карточки сводок из оригинального текста)
    for (const sf of summaryFlags) {
        const alreadyExists = meta.events.some(e => e._summaryId === sf._summaryId);
        if (!alreadyExists && sf._summaryId) {
            meta.events.push({
                summary: sf.summary,
                isSummary: true,
                _summaryId: sf._summaryId,
                level: '摘要',
            });
        }
    }
}

/**
 * Проверить и исправить состояния is_hidden и _compressedBy в сообщениях в диапазоне сводки,
 * Предотвратить потерю меток скрытия/сжатия из-за перерендеринга SillyTavern или гонки saveChat
 */
function enforceHiddenState() {
    const chat = horaeManager.getChat();
    if (!chat?.length) return;
    const sums = chat[0]?.horae_meta?.autoSummaries;
    if (!sums?.length) return;

    let fixed = 0;
    for (const s of sums) {
        if (!s.active || !s.range) continue;
        const summaryId = s.id;
        for (let i = s.range[0]; i <= s.range[1]; i++) {
            if (i === 0 || !chat[i]) continue;
            // Исправить is_hidden
            if (!chat[i].is_hidden) {
                chat[i].is_hidden = true;
                fixed++;
                const $el = $(`.mes[mesid="${i}"]`);
                if ($el.length) $el.attr('is_hidden', 'true');
            }
            // Исправить _compressedBy
            const events = chat[i].horae_meta?.events;
            if (events) {
                for (const evt of events) {
                    if (!evt.isSummary && !evt._summaryId && !evt._compressedBy) {
                        evt._compressedBy = summaryId;
                        fixed++;
                    }
                }
            }
        }
    }
    if (fixed > 0) {
        console.log(`[Horae] enforceHiddenState: исправлено ${fixed} состояний сводок`);
        getContext().saveChat();
    }
}

/**
 * Ручное исправление одним нажатием: перебрать все активные сводки, принудительно восстановить is_hidden + _compressedBy,
 * синхронизировать DOM атрибуты. Возвращает количество исправлений.
 */
function repairAllSummaryStates() {
    const chat = horaeManager.getChat();
    if (!chat?.length) return 0;
    const sums = chat[0]?.horae_meta?.autoSummaries;
    if (!sums?.length) return 0;

    let fixed = 0;
    for (const s of sums) {
        if (!s.active || !s.range) continue;
        const summaryId = s.id;
        for (let i = s.range[0]; i <= s.range[1]; i++) {
            if (i === 0 || !chat[i]) continue;
            // Принудительное is_hidden
            if (!chat[i].is_hidden) {
                chat[i].is_hidden = true;
                fixed++;
            }
            const $el = $(`.mes[mesid="${i}"]`);
            if ($el.length) $el.attr('is_hidden', 'true');
            // Принудительное _compressedBy
            const events = chat[i].horae_meta?.events;
            if (events) {
                for (const evt of events) {
                    if (!evt.isSummary && !evt._summaryId && !evt._compressedBy) {
                        evt._compressedBy = summaryId;
                        fixed++;
                    }
                }
            }
        }
    }
    if (fixed > 0) {
        console.log(`[Horae] repairAllSummaryStates: исправлено ${fixed}`);
        getContext().saveChat();
    }
    return fixed;
}

/** Обновить все раскрытые нижние панели */
function refreshVisiblePanels() {
    document.querySelectorAll('.horae-message-panel').forEach(panelEl => {
        const msgEl = panelEl.closest('.mes');
        if (!msgEl) return;
        const msgId = parseInt(msgEl.getAttribute('mesid'));
        if (isNaN(msgId)) return;
        const chat = horaeManager.getChat();
        const meta = chat?.[msgId]?.horae_meta;
        if (!meta) return;
        const contentEl = panelEl.querySelector('.horae-panel-content');
        if (contentEl) {
            contentEl.innerHTML = buildPanelContent(msgId, meta);
            bindPanelEvents(panelEl);
        }
    });
}

/**
 * Обновить отображение списка памяти о локациях
 */
function updateLocationMemoryDisplay() {
    const listEl = document.getElementById('horae-location-list');
    if (!listEl) return;
    
    const locMem = horaeManager.getLocationMemory();
    const entries = Object.entries(locMem).filter(([, info]) => !info._deleted);
    const currentLoc = horaeManager.getLatestState()?.scene?.location || '';
    
    if (entries.length === 0) {
        listEl.innerHTML = `
            <div class="horae-empty-state">
                <i class="fa-solid fa-map-location-dot"></i>
                <span>Нет памяти о локациях</span>
                <span style="font-size:11px;opacity:0.6;margin-top:4px;">После включения «Настройки → Память о локациях» ИИ будет автоматически записывать информацию при первом посещении нового места</span>
            </div>`;
        return;
    }
    
    // Группировка по родителям: «Таверна·Зал» → parent=Таверна, child=Зал
    const SEP = /[·・\-\/\|]/;
    const groups = {};   // { parentName: { info?, children: [{name,info}] } }
    const standalone = []; // Независимые записи без дочерних
    
    for (const [name, info] of entries) {
        const sepMatch = name.match(SEP);
        if (sepMatch) {
            const parent = name.substring(0, sepMatch.index).trim();
            if (!groups[parent]) groups[parent] = { children: [] };
            groups[parent].children.push({ name, info });
            // Если существует родительская запись с таким же именем — связать
            if (locMem[parent]) groups[parent].info = locMem[parent];
        } else if (groups[name]) {
            groups[name].info = info;
        } else {
            // Проверить, есть ли уже дочерние ссылки
            const hasChildren = entries.some(([n]) => n !== name && n.startsWith(name) && SEP.test(n.charAt(name.length)));
            if (hasChildren) {
                if (!groups[name]) groups[name] = { children: [] };
                groups[name].info = info;
            } else {
                standalone.push({ name, info });
            }
        }
    }
    
    const buildCard = (name, info, indent = false) => {
        const isCurrent = name === currentLoc || currentLoc.includes(name) || name.includes(currentLoc);
        const currentClass = isCurrent ? 'horae-location-current' : '';
        const currentBadge = isCurrent ? '<span class="horae-loc-current-badge">Текущее</span>' : '';
        const dateStr = info.lastUpdated ? new Date(info.lastUpdated).toLocaleDateString() : '';
        const indentClass = indent ? ' horae-loc-child' : '';
        const displayName = indent ? name.split(SEP).pop().trim() : name;
        return `
            <div class="horae-location-card ${currentClass}${indentClass}" data-location-name="${escapeHtml(name)}">
                <div class="horae-loc-header">
                    <div class="horae-loc-name"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(displayName)} ${currentBadge}</div>
                    <div class="horae-loc-actions">
                        <button class="horae-loc-edit" title="Редактировать"><i class="fa-solid fa-pen"></i></button>
                        <button class="horae-loc-delete" title="Удалить"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <div class="horae-loc-desc">${info.desc || '<span class="horae-empty-hint">Нет описания</span>'}</div>
                ${dateStr ? `<div class="horae-loc-date">Обновлено ${dateStr}</div>` : ''}
            </div>`;
    };
    
    let html = '';
    // Рендеринг групп с дочерними
    for (const [parentName, group] of Object.entries(groups)) {
        const isParentCurrent = currentLoc.startsWith(parentName);
        html += `<div class="horae-loc-group${isParentCurrent ? ' horae-loc-group-active' : ''}">
            <div class="horae-loc-group-header" data-parent="${escapeHtml(parentName)}">
                <i class="fa-solid fa-chevron-${isParentCurrent ? 'down' : 'right'} horae-loc-fold-icon"></i>
                <i class="fa-solid fa-building"></i> <strong>${escapeHtml(parentName)}</strong>
                <span class="horae-loc-group-count">${group.children.length + (group.info ? 1 : 0)}</span>
            </div>
            <div class="horae-loc-group-body" style="display:${isParentCurrent ? 'block' : 'none'};">`;
        if (group.info) html += buildCard(parentName, group.info, false);
        for (const child of group.children) html += buildCard(child.name, child.info, true);
        html += '</div></div>';
    }
    // Рендеринг независимых записей
    for (const { name, info } of standalone) html += buildCard(name, info, false);
    
    listEl.innerHTML = html;
    
    // Переключение свернуть/развернуть
    listEl.querySelectorAll('.horae-loc-group-header').forEach(header => {
        header.addEventListener('click', () => {
            const body = header.nextElementSibling;
            const icon = header.querySelector('.horae-loc-fold-icon');
            const hidden = body.style.display === 'none';
            body.style.display = hidden ? 'block' : 'none';
            icon.className = `fa-solid fa-chevron-${hidden ? 'down' : 'right'} horae-loc-fold-icon`;
        });
    });
    
    listEl.querySelectorAll('.horae-loc-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.closest('.horae-location-card').dataset.locationName;
            openLocationEditModal(name);
        });
    });
    
    listEl.querySelectorAll('.horae-loc-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const name = btn.closest('.horae-location-card').dataset.locationName;
            if (!confirm(`Удалить память о локации «${name}»?`)) return;
            const chat = horaeManager.getChat();
            if (chat?.[0]?.horae_meta?.locationMemory) {
                // Пометить как удалённое, а не удалять сразу, чтобы rebuildLocationMemory не восстановил из истории
                chat[0].horae_meta.locationMemory[name] = {
                    ...chat[0].horae_meta.locationMemory[name],
                    _deleted: true
                };
                await getContext().saveChat();
                updateLocationMemoryDisplay();
                showToast(`Локация «${name}» удалена`, 'info');
            }
        });
    });
}

/**
 * Открыть диалог редактирования памяти о локации
 */
function openLocationEditModal(locationName) {
    closeEditModal();
    const locMem = horaeManager.getLocationMemory();
    const isNew = !locationName || !locMem[locationName];
    const existing = isNew ? { desc: '' } : locMem[locationName];
    
    const modalHtml = `
        <div id="horae-edit-modal" class="horae-modal">
            <div class="horae-modal-content">
                <div class="horae-modal-header">
                    <i class="fa-solid fa-map-location-dot"></i> ${isNew ? 'Добавить место' : 'Редактировать память о локации'}
                </div>
                <div class="horae-modal-body horae-edit-modal-body">
                    <div class="horae-edit-field">
                        <label>Название места</label>
                        <input type="text" id="horae-loc-edit-name" value="${escapeHtml(locationName || '')}" placeholder="напр.: Безымянная таверна · Зал">
                    </div>
                    <div class="horae-edit-field">
                        <label>Описание локации</label>
                        <textarea id="horae-loc-edit-desc" rows="5" placeholder="Опишите постоянные физические характеристики места...">${escapeHtml(existing.desc || '')}</textarea>
                    </div>
                </div>
                <div class="horae-modal-footer">
                    <button id="horae-loc-save" class="horae-btn primary">
                        <i class="fa-solid fa-check"></i> Сохранить
                    </button>
                    <button id="horae-loc-cancel" class="horae-btn">
                        <i class="fa-solid fa-xmark"></i> Отмена
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    preventModalBubble();
    
    document.getElementById('horae-edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'horae-edit-modal') closeEditModal();
    });
    
    document.getElementById('horae-loc-save').addEventListener('click', async (e) => {
        e.stopPropagation();
        const name = document.getElementById('horae-loc-edit-name').value.trim();
        const desc = document.getElementById('horae-loc-edit-desc').value.trim();
        if (!name) { showToast('Название места не может быть пустым', 'warning'); return; }
        
        const chat = horaeManager.getChat();
        if (!chat?.length) return;
        if (!chat[0].horae_meta) chat[0].horae_meta = createEmptyMeta();
        if (!chat[0].horae_meta.locationMemory) chat[0].horae_meta.locationMemory = {};
        const mem = chat[0].horae_meta.locationMemory;
        
        const now = new Date().toISOString();
        if (isNew) {
            mem[name] = { desc, firstSeen: now, lastUpdated: now, _userEdited: true };
        } else if (locationName !== name) {
            // Переименование: каскадное обновление дочерних + запись псевдонима
            const SEP = /[·・\-\/\|]/;
            const oldEntry = mem[locationName] || {};
            const aliases = oldEntry._aliases || [];
            if (!aliases.includes(locationName)) aliases.push(locationName);
            delete mem[locationName];
            mem[name] = { ...oldEntry, desc, lastUpdated: now, _userEdited: true, _aliases: aliases };
            // Проверить переименование родителя, каскадно обновить всех потомков
            const childKeys = Object.keys(mem).filter(k => {
                const sepMatch = k.match(SEP);
                return sepMatch && k.substring(0, sepMatch.index).trim() === locationName;
            });
            for (const childKey of childKeys) {
                const sepMatch = childKey.match(SEP);
                const childPart = childKey.substring(sepMatch.index);
                const newChildKey = name + childPart;
                const childEntry = mem[childKey];
                const childAliases = childEntry._aliases || [];
                if (!childAliases.includes(childKey)) childAliases.push(childKey);
                delete mem[childKey];
                mem[newChildKey] = { ...childEntry, lastUpdated: now, _aliases: childAliases };
            }
        } else {
            mem[name] = { ...existing, desc, lastUpdated: now, _userEdited: true };
        }
        
        await getContext().saveChat();
        closeEditModal();
        updateLocationMemoryDisplay();
        showToast(isNew ? 'Место добавлено' : (locationName !== name ? `Переименовано: ${locationName} → ${name}` : 'Память о локации обновлена'), 'success');
    });
    
    document.getElementById('horae-loc-cancel').addEventListener('click', () => closeEditModal());
}

/**
 * Объединить память о двух локациях
 */
function openLocationMergeModal() {
    closeEditModal();
    const locMem = horaeManager.getLocationMemory();
    const entries = Object.entries(locMem);
    
    if (entries.length < 2) {
        showToast('Для объединения нужно минимум 2 места', 'warning');
        return;
    }
    
    const options = entries.map(([name]) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    
    const modalHtml = `
        <div id="horae-edit-modal" class="horae-modal">
            <div class="horae-modal-content">
                <div class="horae-modal-header">
                    <i class="fa-solid fa-code-merge"></i> Объединить места
                </div>
                <div class="horae-modal-body horae-edit-modal-body">
                    <div class="horae-setting-hint" style="margin-bottom: 12px;">
                        <i class="fa-solid fa-circle-info"></i>
                        Выберите два места для объединения. Описание источника будет добавлено к целевому месту.
                    </div>
                    <div class="horae-edit-field">
                        <label>Источник (будет удалён)</label>
                        <select id="horae-merge-source">${options}</select>
                    </div>
                    <div class="horae-edit-field">
                        <label>Цель (сохраняется)</label>
                        <select id="horae-merge-target">${options}</select>
                    </div>
                    <div id="horae-merge-preview" class="horae-merge-preview" style="display:none;">
                        <strong>Предпросмотр объединения:</strong><br><span id="horae-merge-preview-text"></span>
                    </div>
                </div>
                <div class="horae-modal-footer">
                    <button id="horae-merge-confirm" class="horae-btn primary">
                        <i class="fa-solid fa-check"></i> Объединить
                    </button>
                    <button id="horae-merge-cancel" class="horae-btn">
                        <i class="fa-solid fa-xmark"></i> Отмена
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    preventModalBubble();
    
    if (entries.length >= 2) {
        document.getElementById('horae-merge-target').selectedIndex = 1;
    }
    
    document.getElementById('horae-edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'horae-edit-modal') closeEditModal();
    });
    
    const updatePreview = () => {
        const source = document.getElementById('horae-merge-source').value;
        const target = document.getElementById('horae-merge-target').value;
        const previewEl = document.getElementById('horae-merge-preview');
        const textEl = document.getElementById('horae-merge-preview-text');
        
        if (source === target) {
            previewEl.style.display = 'block';
            textEl.textContent = 'Источник и цель не могут совпадать';
            return;
        }
        
        const sourceDesc = locMem[source]?.desc || '';
        const targetDesc = locMem[target]?.desc || '';
        const merged = targetDesc + (targetDesc && sourceDesc ? '\n' : '') + sourceDesc;
        previewEl.style.display = 'block';
        textEl.textContent = `«${source}» → «${target}»\nОписание после объединения: ${merged.substring(0, 100)}${merged.length > 100 ? '...' : ''}`;
    };
    
    document.getElementById('horae-merge-source').addEventListener('change', updatePreview);
    document.getElementById('horae-merge-target').addEventListener('change', updatePreview);
    updatePreview();
    
    document.getElementById('horae-merge-confirm').addEventListener('click', async (e) => {
        e.stopPropagation();
        const source = document.getElementById('horae-merge-source').value;
        const target = document.getElementById('horae-merge-target').value;
        
        if (source === target) {
            showToast('Источник и цель не могут совпадать', 'warning');
            return;
        }
        
        if (!confirm(`Объединить «${source}» с «${target}»?\n«${source}» будет удалено.`)) return;
        
        const chat = horaeManager.getChat();
        const mem = chat?.[0]?.horae_meta?.locationMemory;
        if (!mem) return;
        
        const sourceDesc = mem[source]?.desc || '';
        const targetDesc = mem[target]?.desc || '';
        mem[target].desc = targetDesc + (targetDesc && sourceDesc ? '\n' : '') + sourceDesc;
        mem[target].lastUpdated = new Date().toISOString();
        delete mem[source];
        
        await getContext().saveChat();
        closeEditModal();
        updateLocationMemoryDisplay();
        showToast(`«${source}» объединено с «${target}»`, 'success');
    });
    
    document.getElementById('horae-merge-cancel').addEventListener('click', () => closeEditModal());
}

function updateTokenCounter() {
    const el = document.getElementById('horae-token-value');
    if (!el) return;
    try {
        const dataPrompt = horaeManager.generateCompactPrompt();
        const rulesPrompt = horaeManager.generateSystemPromptAddition();
        const combined = `${dataPrompt}\n${rulesPrompt}`;
        const tokens = estimateTokens(combined);
        el.textContent = `≈ ${tokens.toLocaleString()}`;
    } catch {
        el.textContent = '--';
    }
}

/**
 * Прокрутить к указанному сообщению (поддержка раскрытия свёрнутых/ленивозагруженных сообщений)
 */
async function scrollToMessage(messageId) {
    let messageEl = document.querySelector(`.mes[mesid="${messageId}"]`);
    if (messageEl) {
        messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageEl.classList.add('horae-highlight');
        setTimeout(() => messageEl.classList.remove('horae-highlight'), 2000);
        return;
    }
    // Сообщение не в DOM (свёрнуто/лениво загружено), предложить раскрыть
    if (!confirm(`Целевое сообщение #${messageId} далеко и свёрнуто, прямой переход невозможен.\nРазвернуть и перейти к нему?`)) return;
    try {
        const slashModule = await import('/scripts/slash-commands.js');
        const exec = slashModule.executeSlashCommandsWithOptions;
        await exec(`/go ${messageId}`);
        await new Promise(r => setTimeout(r, 300));
        messageEl = document.querySelector(`.mes[mesid="${messageId}"]`);
        if (messageEl) {
            messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageEl.classList.add('horae-highlight');
            setTimeout(() => messageEl.classList.remove('horae-highlight'), 2000);
        } else {
            showToast(`Не удалось развернуть сообщение #${messageId}, найдите вручную`, 'warning');
        }
    } catch (err) {
        console.warn('[Horae] Переход не удался:', err);
        showToast(`Переход не удался: ${err.message || 'неизвестная ошибка'}`, 'error');
    }
}

/** Применить видимость верхней иконки */
function applyTopIconVisibility() {
    const show = settings.showTopIcon !== false;
    if (show) {
        $('#horae_drawer').show();
    } else {
        // Сначала закрыть панель, затем скрыть
        if ($('#horae_drawer_icon').hasClass('openIcon')) {
            $('#horae_drawer_icon').toggleClass('openIcon closedIcon');
            $('#horae_drawer_content').toggleClass('openDrawer closedDrawer').hide();
        }
        $('#horae_drawer').hide();
    }
    // Синхронизировать оба переключателя
    $('#horae-setting-show-top-icon').prop('checked', show);
    $('#horae-ext-show-top-icon').prop('checked', show);
}

/** Применить настройки ширины и смещения панели сообщений (нижняя панель + RPG HUD) */
function applyPanelWidth() {
    const width = Math.max(50, Math.min(100, settings.panelWidth || 100));
    const offset = Math.max(0, settings.panelOffset || 0);
    const mw = width < 100 ? `${width}%` : '';
    const ml = offset > 0 ? `${offset}px` : '';
    document.querySelectorAll('.horae-message-panel, .horae-rpg-hud').forEach(el => {
        el.style.maxWidth = mw;
        el.style.marginLeft = ml;
    });
}

/** Встроенные предустановленные темы */
const BUILTIN_THEMES = {
    'sakura': {
        name: 'Сакура',
        variables: {
            '--horae-primary': '#ec4899', '--horae-primary-light': '#f472b6', '--horae-primary-dark': '#be185d',
            '--horae-accent': '#fb923c', '--horae-success': '#34d399', '--horae-warning': '#fbbf24',
            '--horae-danger': '#f87171', '--horae-info': '#60a5fa',
            '--horae-bg': '#1f1018', '--horae-bg-secondary': '#2d1825', '--horae-bg-hover': '#3d2535',
            '--horae-border': 'rgba(236, 72, 153, 0.15)', '--horae-text': '#fce7f3', '--horae-text-muted': '#d4a0b9',
            '--horae-shadow': '0 4px 20px rgba(190, 24, 93, 0.2)'
        }
    },
    'forest': {
        name: 'Лесной',
        variables: {
            '--horae-primary': '#059669', '--horae-primary-light': '#34d399', '--horae-primary-dark': '#047857',
            '--horae-accent': '#fbbf24', '--horae-success': '#10b981', '--horae-warning': '#f59e0b',
            '--horae-danger': '#ef4444', '--horae-info': '#60a5fa',
            '--horae-bg': '#0f1a14', '--horae-bg-secondary': '#1a2e22', '--horae-bg-hover': '#2a3e32',
            '--horae-border': 'rgba(16, 185, 129, 0.15)', '--horae-text': '#d1fae5', '--horae-text-muted': '#6ee7b7',
            '--horae-shadow': '0 4px 20px rgba(4, 120, 87, 0.2)'
        }
    },
    'ocean': {
        name: 'Океанский',
        variables: {
            '--horae-primary': '#3b82f6', '--horae-primary-light': '#60a5fa', '--horae-primary-dark': '#1d4ed8',
            '--horae-accent': '#f59e0b', '--horae-success': '#10b981', '--horae-warning': '#f59e0b',
            '--horae-danger': '#ef4444', '--horae-info': '#93c5fd',
            '--horae-bg': '#0c1929', '--horae-bg-secondary': '#162a45', '--horae-bg-hover': '#1e3a5f',
            '--horae-border': 'rgba(59, 130, 246, 0.15)', '--horae-text': '#dbeafe', '--horae-text-muted': '#93c5fd',
            '--horae-shadow': '0 4px 20px rgba(29, 78, 216, 0.2)'
        }
    }
};

/** Получить текущий объект темы (встроенный или пользовательский) */
function resolveTheme(mode) {
    if (BUILTIN_THEMES[mode]) return BUILTIN_THEMES[mode];
    if (mode.startsWith('custom-')) {
        const idx = parseInt(mode.split('-')[1]);
        return (settings.customThemes || [])[idx] || null;
    }
    return null;
}

function isLightMode() {
    const mode = settings.themeMode || 'dark';
    if (mode === 'light') return true;
    const theme = resolveTheme(mode);
    return !!(theme && theme.isLight);
}

/** Применить режим темы (dark / light / встроенная / custom-{index}) */
function applyThemeMode() {
    const mode = settings.themeMode || 'dark';
    const theme = resolveTheme(mode);
    const isLight = mode === 'light' || !!(theme && theme.isLight);
    const hasCustomVars = !!(theme && theme.variables);

    // Переключить класс horae-light (нужен для дневного режима, активирует детали UI — рамки чекбоксов и т.д.)
    const targets = [
        document.getElementById('horae_drawer'),
        ...document.querySelectorAll('.horae-message-panel'),
        ...document.querySelectorAll('.horae-modal'),
        ...document.querySelectorAll('.horae-rpg-hud')
    ].filter(Boolean);
    targets.forEach(el => el.classList.toggle('horae-light', isLight));

    // Инжектировать переменные темы
    let themeStyleEl = document.getElementById('horae-theme-vars');
    if (hasCustomVars) {
        if (!themeStyleEl) {
            themeStyleEl = document.createElement('style');
            themeStyleEl.id = 'horae-theme-vars';
            document.head.appendChild(themeStyleEl);
        }
        const vars = Object.entries(theme.variables)
            .map(([k, v]) => `  ${k}: ${v};`)
            .join('\n');
        // Дневная пользовательская тема: добавить .horae-light для переопределения переменных класса в style.css
        const needsLightOverride = isLight && mode !== 'light';
        const selectors = needsLightOverride
            ? '#horae_drawer,\n#horae_drawer.horae-light,\n.horae-message-panel,\n.horae-message-panel.horae-light,\n.horae-modal,\n.horae-modal.horae-light,\n.horae-context-menu,\n.horae-context-menu.horae-light,\n.horae-rpg-hud,\n.horae-rpg-hud.horae-light,\n.horae-rpg-dice-panel,\n.horae-rpg-dice-panel.horae-light,\n.horae-progress-overlay,\n.horae-progress-overlay.horae-light'
            : '#horae_drawer,\n.horae-message-panel,\n.horae-modal,\n.horae-context-menu,\n.horae-rpg-hud,\n.horae-rpg-dice-panel,\n.horae-progress-overlay';
        themeStyleEl.textContent = `${selectors} {\n${vars}\n}`;
    } else {
        if (themeStyleEl) themeStyleEl.remove();
    }

    // Инжектировать прикреплённый CSS темы
    let themeCssEl = document.getElementById('horae-theme-css');
    if (theme && theme.css) {
        if (!themeCssEl) {
            themeCssEl = document.createElement('style');
            themeCssEl.id = 'horae-theme-css';
            document.head.appendChild(themeCssEl);
        }
        themeCssEl.textContent = theme.css;
    } else {
        if (themeCssEl) themeCssEl.remove();
    }
}

/** Инжектировать пользовательский CSS */
function applyCustomCSS() {
    let styleEl = document.getElementById('horae-custom-style');
    const css = (settings.customCSS || '').trim();
    if (!css) {
        if (styleEl) styleEl.remove();
        return;
    }
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'horae-custom-style';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
}

/** Экспортировать текущую тему в JSON */
function exportTheme() {
    const theme = {
        name: 'Моя тема Horae',
        author: '',
        version: '1.0',
        variables: {},
        css: settings.customCSS || ''
    };
    // Считать переменные текущей темы
    const root = document.getElementById('horae_drawer');
    if (root) {
        const style = getComputedStyle(root);
        const varNames = [
            '--horae-primary', '--horae-primary-light', '--horae-primary-dark',
            '--horae-accent', '--horae-success', '--horae-warning', '--horae-danger', '--horae-info',
            '--horae-bg', '--horae-bg-secondary', '--horae-bg-hover',
            '--horae-border', '--horae-text', '--horae-text-muted',
            '--horae-shadow', '--horae-radius', '--horae-radius-sm'
        ];
        varNames.forEach(name => {
            const val = style.getPropertyValue(name).trim();
            if (val) theme.variables[name] = val;
        });
    }
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'horae-theme.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Тема экспортирована', 'info');
}

/** Импортировать тему из JSON */
function importTheme() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const theme = JSON.parse(text);
            if (!theme.variables || typeof theme.variables !== 'object') {
                showToast('Неверный файл темы: отсутствует поле variables', 'error');
                return;
            }
            theme.name = theme.name || file.name.replace('.json', '');
            if (!settings.customThemes) settings.customThemes = [];
            settings.customThemes.push(theme);
            saveSettings();
            refreshThemeSelector();
            showToast(`Тема «${theme.name}» импортирована`, 'success');
        } catch (err) {
            showToast('Ошибка разбора файла темы', 'error');
            console.error('[Horae] Ошибка импорта темы:', err);
        }
    });
    input.click();
}

/** Обновить выпадающий список тем */
function refreshThemeSelector() {
    const sel = document.getElementById('horae-setting-theme-mode');
    if (!sel) return;
    // Очистить динамические опции (встроенные + пользовательские)
    sel.querySelectorAll('option:not([value="dark"]):not([value="light"])').forEach(o => o.remove());
    // Встроенные предустановленные темы
    for (const [key, t] of Object.entries(BUILTIN_THEMES)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = `🎨 ${t.name}`;
        sel.appendChild(opt);
    }
    // Пользовательские импортированные темы
    const themes = settings.customThemes || [];
    themes.forEach((t, i) => {
        const opt = document.createElement('option');
        opt.value = `custom-${i}`;
        opt.textContent = `📁 ${t.name}`;
        sel.appendChild(opt);
    });
    sel.value = settings.themeMode || 'dark';
}

/** Удалить импортированную пользовательскую тему */
function deleteCustomTheme(index) {
    const themes = settings.customThemes || [];
    if (!themes[index]) return;
    if (!confirm(`Удалить тему «${themes[index].name}»?`)) return;
    const currentMode = settings.themeMode || 'dark';
    themes.splice(index, 1);
    settings.customThemes = themes;
    // Если удалённая тема — текущая, откатить на тёмную
    if (currentMode === `custom-${index}` || (currentMode.startsWith('custom-') && parseInt(currentMode.split('-')[1]) >= index)) {
        settings.themeMode = 'dark';
        applyThemeMode();
    }
    saveSettings();
    refreshThemeSelector();
    showToast('Тема удалена', 'info');
}

// ============================================
// Инструмент настройки темы (Theme Designer)
// ============================================

function _tdHslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * Math.max(0, Math.min(1, c))).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function _tdHexToHsl(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function _tdHexToRgb(hex) {
    hex = hex.replace('#', '');
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
}

function _tdParseColorHsl(str) {
    if (!str) return { h: 265, s: 84, l: 58 };
    str = str.trim();
    if (str.startsWith('#')) return _tdHexToHsl(str);
    const hm = str.match(/hsla?\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?/);
    if (hm) return { h: +hm[1], s: +hm[2], l: +hm[3] };
    const rm = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rm) return _tdHexToHsl('#' + [rm[1], rm[2], rm[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join(''));
    return { h: 265, s: 84, l: 58 };
}

function _tdGenerateVars(hue, sat, brightness, accentHex, colorLight) {
    const isDark = brightness <= 50;
    const s = Math.max(15, sat);
    const pL = colorLight || 50;
    const v = {};
    if (isDark) {
        const bgL = 6 + (brightness / 50) * 10;
        v['--horae-primary'] = _tdHslToHex(hue, s, pL);
        v['--horae-primary-light'] = _tdHslToHex(hue, Math.max(s - 12, 25), Math.min(pL + 16, 90));
        v['--horae-primary-dark'] = _tdHslToHex(hue, Math.min(s + 5, 100), Math.max(pL - 14, 10));
        v['--horae-bg'] = _tdHslToHex(hue, Math.min(s, 22), bgL);
        v['--horae-bg-secondary'] = _tdHslToHex(hue, Math.min(s, 16), bgL + 5);
        v['--horae-bg-hover'] = _tdHslToHex(hue, Math.min(s, 14), bgL + 10);
        v['--horae-border'] = `rgba(255,255,255,0.1)`;
        v['--horae-text'] = _tdHslToHex(hue, 8, 90);
        v['--horae-text-muted'] = _tdHslToHex(hue, 6, 63);
        v['--horae-shadow'] = `0 4px 20px rgba(0,0,0,0.3)`;
    } else {
        const bgL = 92 + ((brightness - 50) / 50) * 5;
        v['--horae-primary'] = _tdHslToHex(hue, s, pL);
        v['--horae-primary-light'] = _tdHslToHex(hue, s, Math.max(pL - 8, 10));
        v['--horae-primary-dark'] = _tdHslToHex(hue, Math.max(s - 12, 25), Math.min(pL + 14, 85));
        v['--horae-bg'] = _tdHslToHex(hue, Math.min(s, 12), bgL);
        v['--horae-bg-secondary'] = _tdHslToHex(hue, Math.min(s, 10), bgL - 4);
        v['--horae-bg-hover'] = _tdHslToHex(hue, Math.min(s, 10), bgL - 8);
        v['--horae-border'] = `rgba(0,0,0,0.12)`;
        v['--horae-text'] = _tdHslToHex(hue, 8, 12);
        v['--horae-text-muted'] = _tdHslToHex(hue, 5, 38);
        v['--horae-shadow'] = `0 4px 20px rgba(0,0,0,0.08)`;
    }
    if (accentHex) v['--horae-accent'] = accentHex;
    v['--horae-success'] = '#10b981';
    v['--horae-warning'] = '#f59e0b';
    v['--horae-danger'] = '#ef4444';
    v['--horae-info'] = '#3b82f6';
    return v;
}

function _tdBuildImageCSS(images, opacities, bgHex, drawerBg) {
    const parts = [];
    // Верхняя иконка (#horae_drawer)
    if (images.drawer && bgHex) {
        const c = _tdHexToRgb(drawerBg || bgHex);
        const a = (1 - (opacities.drawer || 30) / 100).toFixed(2);
        parts.push(`#horae_drawer {
  background-image: linear-gradient(rgba(${c.r},${c.g},${c.b},${a}), rgba(${c.r},${c.g},${c.b},${a})), url('${images.drawer}') !important;
  background-size: auto, cover !important;
  background-position: center, center !important;
  background-repeat: no-repeat, no-repeat !important;
}`);
    }
    // Изображение шапки панели
    if (images.header) {
        parts.push(`#horae_drawer .drawer-header {
  background-image: url('${images.header}') !important;
  background-size: cover !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}`);
    }
    // Фоновое изображение панели
    const bodyBg = drawerBg || bgHex;
    if (images.body && bodyBg) {
        const c = _tdHexToRgb(bodyBg);
        const a = (1 - (opacities.body || 30) / 100).toFixed(2);
        parts.push(`.horae-tab-contents {
  background-image: linear-gradient(rgba(${c.r},${c.g},${c.b},${a}), rgba(${c.r},${c.g},${c.b},${a})), url('${images.body}') !important;
  background-size: auto, cover !important;
  background-position: center, center !important;
  background-repeat: no-repeat, no-repeat !important;
}`);
    } else if (drawerBg) {
        parts.push(`.horae-tab-contents { background-color: ${drawerBg} !important; }`);
    }
    // Изображение нижней панели сообщений — только для свёрнутой полосы toggle, не применяется к раскрытому содержимому
    if (images.panel && bgHex) {
        const c = _tdHexToRgb(bgHex);
        const a = (1 - (opacities.panel || 30) / 100).toFixed(2);
        parts.push(`.horae-message-panel > .horae-panel-toggle {
  background-image: linear-gradient(rgba(${c.r},${c.g},${c.b},${a}), rgba(${c.r},${c.g},${c.b},${a})), url('${images.panel}') !important;
  background-size: auto, cover !important;
  background-position: center, center !important;
  background-repeat: no-repeat, no-repeat !important;
}`);
    }
    return parts.join('\n');
}

function openThemeDesigner() {
    document.querySelector('.horae-theme-designer')?.remove();

    const drawer = document.getElementById('horae_drawer');
    const cs = drawer ? getComputedStyle(drawer) : null;
    const priStr = cs?.getPropertyValue('--horae-primary').trim() || '#7c3aed';
    const accStr = cs?.getPropertyValue('--horae-accent').trim() || '#f59e0b';
    const initHsl = _tdParseColorHsl(priStr);

    // Попробовать восстановить все настройки из текущей пользовательской темы
    let savedImages = { drawer: '', header: '', body: '', panel: '' };
    let savedImgOp = { drawer: 30, header: 50, body: 30, panel: 30 };
    let savedName = '', savedAuthor = '', savedDrawerBg = '';
    let savedDesigner = null;
    const curTheme = resolveTheme(settings.themeMode || 'dark');
    if (curTheme) {
        if (curTheme.images) savedImages = { ...savedImages, ...curTheme.images };
        if (curTheme.imageOpacity) savedImgOp = { ...savedImgOp, ...curTheme.imageOpacity };
        if (curTheme.name) savedName = curTheme.name;
        if (curTheme.author) savedAuthor = curTheme.author;
        if (curTheme.drawerBg) savedDrawerBg = curTheme.drawerBg;
        if (curTheme._designerState) savedDesigner = curTheme._designerState;
    }

    const st = {
        hue: savedDesigner?.hue ?? initHsl.h,
        sat: savedDesigner?.sat ?? initHsl.s,
        colorLight: savedDesigner?.colorLight ?? initHsl.l,
        bright: savedDesigner?.bright ?? ((isLightMode()) ? 70 : 25),
        accent: savedDesigner?.accent ?? (accStr.startsWith('#') ? accStr : '#f59e0b'),
        images: savedImages,
        imgOp: savedImgOp,
        drawerBg: savedDrawerBg,
        rpgColor: savedDesigner?.rpgColor ?? '#000000',
        rpgOpacity: savedDesigner?.rpgOpacity ?? 85,
        diceColor: savedDesigner?.diceColor ?? '#1a1a2e',
        diceOpacity: savedDesigner?.diceOpacity ?? 15,
        overrides: {}
    };

    const abortCtrl = new AbortController();
    const sig = abortCtrl.signal;

    const imgHtml = (key, label) => {
        const url = st.images[key] || '';
        const op = st.imgOp[key];
        return `<div class="htd-img-group">
        <div class="htd-img-label">${label}</div>
        <input type="text" id="htd-img-${key}" class="htd-input" placeholder="введите URL изображения..." value="${escapeHtml(url)}">
        <div class="htd-img-ctrl"><span>Видимость <em id="htd-imgop-${key}">${op}</em>%</span>
            <input type="range" class="htd-slider" id="htd-imgsl-${key}" min="5" max="100" value="${op}"></div>
        <img id="htd-imgpv-${key}" class="htd-img-preview" ${url ? `src="${escapeHtml(url)}"` : 'style="display:none;"'}>
    </div>`;
    };

    const modal = document.createElement('div');
    modal.className = 'horae-modal horae-theme-designer' + (isLightMode() ? ' horae-light' : '');
    modal.innerHTML = `
    <div class="horae-modal-content htd-content">
        <div class="htd-header"><i class="fa-solid fa-paint-roller"></i> Инструмент настройки темы</div>
        <div class="htd-body">
            <div class="htd-section">
                <div class="htd-section-title">Быстрая настройка цвета</div>
                <div class="htd-field">
                    <span class="htd-label">Оттенок темы</span>
                    <div class="htd-hue-bar" id="htd-hue-bar"><div class="htd-hue-ind" id="htd-hue-ind"></div></div>
                </div>
                <div class="htd-field">
                    <span class="htd-label">Насыщенность <em id="htd-satv">${st.sat}</em>%</span>
                    <input type="range" class="htd-slider" id="htd-sat" min="10" max="100" value="${st.sat}">
                </div>
                <div class="htd-field">
                    <span class="htd-label">Яркость <em id="htd-clv">${st.colorLight}</em></span>
                    <input type="range" class="htd-slider htd-colorlight" id="htd-cl" min="15" max="85" value="${st.colorLight}">
                </div>
                <div class="htd-field">
                    <span class="htd-label">Ночной/дневной <em id="htd-briv">${st.bright <= 50 ? 'Ночь' : 'День'}</em></span>
                    <input type="range" class="htd-slider htd-daynight" id="htd-bri" min="0" max="100" value="${st.bright}">
                </div>
                <div class="htd-field">
                    <span class="htd-label">Акцентный цвет</span>
                    <div class="htd-color-row">
                        <input type="color" id="htd-accent" value="${st.accent}" class="htd-cpick">
                        <span class="htd-hex" id="htd-accent-hex">${st.accent}</span>
                    </div>
                </div>
                <div class="htd-swatches" id="htd-swatches"></div>
            </div>

            <div class="htd-section">
                <div class="htd-section-title htd-toggle" id="htd-fine-t">
                    <i class="fa-solid fa-sliders"></i> Тонкая настройка
                    <i class="fa-solid fa-chevron-down htd-arrow"></i>
                </div>
                <div id="htd-fine-body" style="display:none;"></div>
            </div>

            <div class="htd-section">
                <div class="htd-section-title htd-toggle" id="htd-img-t">
                    <i class="fa-solid fa-image"></i> Декоративные изображения
                    <i class="fa-solid fa-chevron-down htd-arrow"></i>
                </div>
                <div id="htd-imgs-section" style="display:none;">
                    ${imgHtml('drawer', 'Верхняя иконка')}
                    ${imgHtml('header', 'Шапка панели')}
                    ${imgHtml('body', 'Фон содержимого')}
                    <div class="htd-img-group">
                        <div class="htd-img-label">Цвет фона панели</div>
                        <div class="htd-field">
                            <span class="htd-label"><em id="htd-dbg-hex">${st.drawerBg || 'По теме'}</em></span>
                            <div class="htd-color-row">
                                <input type="color" id="htd-dbg" value="${st.drawerBg || '#2d2d3c'}" class="htd-cpick">
                                <button class="horae-btn" id="htd-dbg-clear" style="font-size:10px;padding:2px 8px;">Очистить</button>
                            </div>
                        </div>
                    </div>
                    ${imgHtml('panel', 'Нижняя панель сообщений')}
                </div>
            </div>

            <div class="htd-section">
                <div class="htd-section-title htd-toggle" id="htd-rpg-t">
                    <i class="fa-solid fa-shield-halved"></i> RPG Статус
                    <i class="fa-solid fa-chevron-down htd-arrow"></i>
                </div>
                <div id="htd-rpg-section" style="display:none;">
                    <div class="htd-field">
                        <span class="htd-label">Цвет фона</span>
                        <div class="htd-color-row">
                            <input type="color" id="htd-rpg-color" value="${st.rpgColor}" class="htd-cpick">
                            <span class="htd-hex" id="htd-rpg-color-hex">${st.rpgColor}</span>
                        </div>
                    </div>
                    <div class="htd-field">
                        <span class="htd-label">Прозрачность <em id="htd-rpg-opv">${st.rpgOpacity}</em>%</span>
                        <input type="range" class="htd-slider" id="htd-rpg-op" min="0" max="100" value="${st.rpgOpacity}">
                    </div>
                </div>
            </div>

            <div class="htd-section">
                <div class="htd-section-title htd-toggle" id="htd-dice-t">
                    <i class="fa-solid fa-dice-d20"></i> Панель кубиков
                    <i class="fa-solid fa-chevron-down htd-arrow"></i>
                </div>
                <div id="htd-dice-section" style="display:none;">
                    <div class="htd-field">
                        <span class="htd-label">Цвет фона</span>
                        <div class="htd-color-row">
                            <input type="color" id="htd-dice-color" value="${st.diceColor}" class="htd-cpick">
                            <span class="htd-hex" id="htd-dice-color-hex">${st.diceColor}</span>
                        </div>
                    </div>
                    <div class="htd-field">
                        <span class="htd-label">Прозрачность <em id="htd-dice-opv">${st.diceOpacity}</em>%</span>
                        <input type="range" class="htd-slider" id="htd-dice-op" min="0" max="100" value="${st.diceOpacity}">
                    </div>
                </div>
            </div>

            <div class="htd-section htd-save-sec">
                <div class="htd-field"><span class="htd-label">Название</span><input type="text" id="htd-name" class="htd-input" placeholder="Моя тема" value="${escapeHtml(savedName)}"></div>
                <div class="htd-field"><span class="htd-label">Автор</span><input type="text" id="htd-author" class="htd-input" placeholder="Аноним" value="${escapeHtml(savedAuthor)}"></div>
                <div class="htd-btn-row">
                    <button class="horae-btn primary" id="htd-save"><i class="fa-solid fa-floppy-disk"></i> Сохранить</button>
                    <button class="horae-btn" id="htd-export"><i class="fa-solid fa-file-export"></i> Экспорт</button>
                    <button class="horae-btn" id="htd-reset"><i class="fa-solid fa-rotate-left"></i> Сбросить</button>
                    <button class="horae-btn" id="htd-cancel"><i class="fa-solid fa-xmark"></i> Отмена</button>
                </div>
            </div>
        </div>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.htd-content').addEventListener('click', e => e.stopPropagation(), { signal: sig });

    const hueBar = modal.querySelector('#htd-hue-bar');
    const hueInd = modal.querySelector('#htd-hue-ind');
    hueInd.style.left = `${(st.hue / 360) * 100}%`;
    hueInd.style.background = `hsl(${st.hue}, 100%, 50%)`;

    // ---- Live preview ----
    function update() {
        const base = _tdGenerateVars(st.hue, st.sat, st.bright, st.accent, st.colorLight);
        const vars = { ...base, ...st.overrides };

        // Переменная фона RPG HUD (прозрачность: 100=полностью прозрачный, 0=непрозрачный)
        if (st.rpgColor) {
            const rc = _tdHexToRgb(st.rpgColor);
            const ra = (1 - (st.rpgOpacity ?? 85) / 100).toFixed(2);
            vars['--horae-rpg-bg'] = `rgba(${rc.r},${rc.g},${rc.b},${ra})`;
        }
        // Переменная фона панели кубиков
        if (st.diceColor) {
            const dc = _tdHexToRgb(st.diceColor);
            const da = (1 - (st.diceOpacity ?? 15) / 100).toFixed(2);
            vars['--horae-dice-bg'] = `rgba(${dc.r},${dc.g},${dc.b},${da})`;
        }

        let previewEl = document.getElementById('horae-designer-preview');
        if (!previewEl) { previewEl = document.createElement('style'); previewEl.id = 'horae-designer-preview'; document.head.appendChild(previewEl); }
        const cssLines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v} !important;`).join('\n');
        previewEl.textContent = `#horae_drawer, .horae-message-panel, .horae-modal, .horae-context-menu, .horae-rpg-hud, .horae-rpg-dice-panel, .horae-progress-overlay {\n${cssLines}\n}`;

        const isLight = st.bright > 50;
        drawer?.classList.toggle('horae-light', isLight);
        modal.classList.toggle('horae-light', isLight);
        document.querySelectorAll('.horae-message-panel').forEach(p => p.classList.toggle('horae-light', isLight));
        document.querySelectorAll('.horae-rpg-hud').forEach(h => h.classList.toggle('horae-light', isLight));
        document.querySelectorAll('.horae-rpg-dice-panel').forEach(d => d.classList.toggle('horae-light', isLight));

        let imgEl = document.getElementById('horae-designer-images');
        const imgCSS = _tdBuildImageCSS(st.images, st.imgOp, vars['--horae-bg'], st.drawerBg);
        if (imgCSS) {
            if (!imgEl) { imgEl = document.createElement('style'); imgEl.id = 'horae-designer-images'; document.head.appendChild(imgEl); }
            imgEl.textContent = imgCSS;
        } else { imgEl?.remove(); }

        const sw = modal.querySelector('#htd-swatches');
        const swKeys = ['--horae-primary', '--horae-primary-light', '--horae-primary-dark', '--horae-accent',
            '--horae-bg', '--horae-bg-secondary', '--horae-bg-hover', '--horae-text', '--horae-text-muted'];
        sw.innerHTML = swKeys.map(k =>
            `<div class="htd-swatch" style="background:${vars[k]}" title="${k.replace('--horae-', '')}: ${vars[k]}"></div>`
        ).join('');

        const fineBody = modal.querySelector('#htd-fine-body');
        if (fineBody.style.display !== 'none') {
            fineBody.querySelectorAll('.htd-fine-cpick').forEach(inp => {
                const vn = inp.dataset.vn;
                if (!st.overrides[vn] && vars[vn]?.startsWith('#')) {
                    inp.value = vars[vn];
                    inp.nextElementSibling.textContent = vars[vn];
                }
            });
        }
    }

    // ---- Hue bar drag ----
    let hueDrag = false;
    function onHue(e) {
        const r = hueBar.getBoundingClientRect();
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const x = Math.max(0, Math.min(r.width, cx - r.left));
        st.hue = Math.round((x / r.width) * 360);
        hueInd.style.left = `${(st.hue / 360) * 100}%`;
        hueInd.style.background = `hsl(${st.hue}, 100%, 50%)`;
        st.overrides = {};
        update();
    }
    hueBar.addEventListener('mousedown', e => { hueDrag = true; onHue(e); }, { signal: sig });
    hueBar.addEventListener('touchstart', e => { hueDrag = true; onHue(e); }, { signal: sig, passive: true });
    document.addEventListener('mousemove', e => { if (hueDrag) onHue(e); }, { signal: sig });
    document.addEventListener('touchmove', e => { if (hueDrag) onHue(e); }, { signal: sig, passive: true });
    document.addEventListener('mouseup', () => hueDrag = false, { signal: sig });
    document.addEventListener('touchend', () => hueDrag = false, { signal: sig });

    // ---- Sliders ----
    modal.querySelector('#htd-sat').addEventListener('input', function () {
        st.sat = +this.value; modal.querySelector('#htd-satv').textContent = st.sat;
        st.overrides = {};
        update();
    }, { signal: sig });

    modal.querySelector('#htd-cl').addEventListener('input', function () {
        st.colorLight = +this.value; modal.querySelector('#htd-clv').textContent = st.colorLight;
        st.overrides = {};
        update();
    }, { signal: sig });

    modal.querySelector('#htd-bri').addEventListener('input', function () {
        st.bright = +this.value;
        modal.querySelector('#htd-briv').textContent = st.bright <= 50 ? 'Ночь' : 'День';
        st.overrides = {};
        update();
    }, { signal: sig });

    modal.querySelector('#htd-accent').addEventListener('input', function () {
        st.accent = this.value;
        modal.querySelector('#htd-accent-hex').textContent = this.value;
        update();
    }, { signal: sig });

    // ---- Collapsible ----
    modal.querySelector('#htd-fine-t').addEventListener('click', () => {
        const body = modal.querySelector('#htd-fine-body');
        const show = body.style.display === 'none';
        body.style.display = show ? 'block' : 'none';
        if (show) buildFine();
    }, { signal: sig });
    modal.querySelector('#htd-img-t').addEventListener('click', () => {
        const sec = modal.querySelector('#htd-imgs-section');
        sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
    }, { signal: sig });

    // ---- Fine pickers ----
    const FINE_VARS = [
        ['--horae-primary', 'Основной цвет'], ['--horae-primary-light', 'Основной светлый'], ['--horae-primary-dark', 'Основной тёмный'],
        ['--horae-accent', 'Акцент'], ['--horae-success', 'Успех'], ['--horae-warning', 'Предупреждение'],
        ['--horae-danger', 'Опасность'], ['--horae-info', 'Информация'],
        ['--horae-bg', 'Фон'], ['--horae-bg-secondary', 'Вторичный фон'], ['--horae-bg-hover', 'Фон при наведении'],
        ['--horae-text', 'Текст'], ['--horae-text-muted', 'Вторичный текст']
    ];
    function buildFine() {
        const c = modal.querySelector('#htd-fine-body');
        const base = _tdGenerateVars(st.hue, st.sat, st.bright, st.accent, st.colorLight);
        const vars = { ...base, ...st.overrides };
        c.innerHTML = FINE_VARS.map(([vn, label]) => {
            const val = vars[vn] || '#888888';
            const hex = val.startsWith('#') ? val : '#888888';
            return `<div class="htd-fine-row"><span>${label}</span>
                <input type="color" class="htd-fine-cpick" data-vn="${vn}" value="${hex}">
                <span class="htd-fine-hex">${val}</span></div>`;
        }).join('');
        c.querySelectorAll('.htd-fine-cpick').forEach(inp => {
            inp.addEventListener('input', () => {
                st.overrides[inp.dataset.vn] = inp.value;
                inp.nextElementSibling.textContent = inp.value;
                update();
            }, { signal: sig });
        });
    }

    // ---- Image inputs ----
    ['drawer', 'header', 'body', 'panel'].forEach(key => {
        const urlIn = modal.querySelector(`#htd-img-${key}`);
        const opSl = modal.querySelector(`#htd-imgsl-${key}`);
        const pv = modal.querySelector(`#htd-imgpv-${key}`);
        const opV = modal.querySelector(`#htd-imgop-${key}`);
        pv.onerror = () => pv.style.display = 'none';
        pv.onload = () => pv.style.display = 'block';
        urlIn.addEventListener('input', () => {
            st.images[key] = urlIn.value.trim();
            if (st.images[key]) pv.src = st.images[key]; else pv.style.display = 'none';
            update();
        }, { signal: sig });
        opSl.addEventListener('input', () => {
            st.imgOp[key] = +opSl.value;
            opV.textContent = opSl.value;
            update();
        }, { signal: sig });
    });

    // ---- Drawer bg color ----
    modal.querySelector('#htd-dbg').addEventListener('input', function () {
        st.drawerBg = this.value;
        modal.querySelector('#htd-dbg-hex').textContent = this.value;
        update();
    }, { signal: sig });
    modal.querySelector('#htd-dbg-clear').addEventListener('click', () => {
        st.drawerBg = '';
        modal.querySelector('#htd-dbg-hex').textContent = 'По теме';
        update();
    }, { signal: sig });

    // ---- RPG Статус ----
    modal.querySelector('#htd-rpg-t').addEventListener('click', () => {
        const sec = modal.querySelector('#htd-rpg-section');
        sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
    }, { signal: sig });
    modal.querySelector('#htd-rpg-color').addEventListener('input', function () {
        st.rpgColor = this.value;
        modal.querySelector('#htd-rpg-color-hex').textContent = this.value;
        update();
    }, { signal: sig });
    modal.querySelector('#htd-rpg-op').addEventListener('input', function () {
        st.rpgOpacity = +this.value;
        modal.querySelector('#htd-rpg-opv').textContent = this.value;
        update();
    }, { signal: sig });

    // ---- Панель кубиков ----
    modal.querySelector('#htd-dice-t').addEventListener('click', () => {
        const sec = modal.querySelector('#htd-dice-section');
        sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
    }, { signal: sig });
    modal.querySelector('#htd-dice-color').addEventListener('input', function () {
        st.diceColor = this.value;
        modal.querySelector('#htd-dice-color-hex').textContent = this.value;
        update();
    }, { signal: sig });
    modal.querySelector('#htd-dice-op').addEventListener('input', function () {
        st.diceOpacity = +this.value;
        modal.querySelector('#htd-dice-opv').textContent = this.value;
        update();
    }, { signal: sig });

    // ---- Close ----
    function closeDesigner() {
        abortCtrl.abort();
        document.getElementById('horae-designer-preview')?.remove();
        document.getElementById('horae-designer-images')?.remove();
        modal.remove();
        applyThemeMode();
    }
    modal.querySelector('#htd-cancel').addEventListener('click', closeDesigner, { signal: sig });
    modal.addEventListener('click', e => { if (e.target === modal) closeDesigner(); }, { signal: sig });

    // ---- Save ----
    modal.querySelector('#htd-save').addEventListener('click', () => {
        const name = modal.querySelector('#htd-name').value.trim() || 'Пользовательская тема';
        const author = modal.querySelector('#htd-author').value.trim() || '';
        const base = _tdGenerateVars(st.hue, st.sat, st.bright, st.accent, st.colorLight);
        const vars = { ...base, ...st.overrides };
        if (st.rpgColor) {
            const rc = _tdHexToRgb(st.rpgColor);
            const ra = (1 - (st.rpgOpacity ?? 85) / 100).toFixed(2);
            vars['--horae-rpg-bg'] = `rgba(${rc.r},${rc.g},${rc.b},${ra})`;
        }
        if (st.diceColor) {
            const dc = _tdHexToRgb(st.diceColor);
            const da = (1 - (st.diceOpacity ?? 15) / 100).toFixed(2);
            vars['--horae-dice-bg'] = `rgba(${dc.r},${dc.g},${dc.b},${da})`;
        }
        const theme = {
            name, author, version: '1.0', variables: vars,
            images: { ...st.images }, imageOpacity: { ...st.imgOp },
            drawerBg: st.drawerBg,
            isLight: st.bright > 50,
            _designerState: { hue: st.hue, sat: st.sat, colorLight: st.colorLight, bright: st.bright, accent: st.accent, rpgColor: st.rpgColor, rpgOpacity: st.rpgOpacity, diceColor: st.diceColor, diceOpacity: st.diceOpacity },
            css: _tdBuildImageCSS(st.images, st.imgOp, vars['--horae-bg'], st.drawerBg)
        };
        if (!settings.customThemes) settings.customThemes = [];
        settings.customThemes.push(theme);
        settings.themeMode = `custom-${settings.customThemes.length - 1}`;
        abortCtrl.abort();
        document.getElementById('horae-designer-preview')?.remove();
        document.getElementById('horae-designer-images')?.remove();
        modal.remove();
        saveSettings();
        applyThemeMode();
        refreshThemeSelector();
        showToast(`Тема «${name}» сохранена и применена`, 'success');
    }, { signal: sig });

    // ---- Export ----
    modal.querySelector('#htd-export').addEventListener('click', () => {
        const name = modal.querySelector('#htd-name').value.trim() || 'Пользовательская тема';
        const author = modal.querySelector('#htd-author').value.trim() || '';
        const base = _tdGenerateVars(st.hue, st.sat, st.bright, st.accent, st.colorLight);
        const vars = { ...base, ...st.overrides };
        if (st.rpgColor) {
            const rc = _tdHexToRgb(st.rpgColor);
            const ra = (1 - (st.rpgOpacity ?? 85) / 100).toFixed(2);
            vars['--horae-rpg-bg'] = `rgba(${rc.r},${rc.g},${rc.b},${ra})`;
        }
        if (st.diceColor) {
            const dc = _tdHexToRgb(st.diceColor);
            const da = (1 - (st.diceOpacity ?? 15) / 100).toFixed(2);
            vars['--horae-dice-bg'] = `rgba(${dc.r},${dc.g},${dc.b},${da})`;
        }
        const theme = {
            name, author, version: '1.0', variables: vars,
            images: { ...st.images }, imageOpacity: { ...st.imgOp },
            drawerBg: st.drawerBg,
            isLight: st.bright > 50,
            _designerState: { hue: st.hue, sat: st.sat, colorLight: st.colorLight, bright: st.bright, accent: st.accent, rpgColor: st.rpgColor, rpgOpacity: st.rpgOpacity, diceColor: st.diceColor, diceOpacity: st.diceOpacity },
            css: _tdBuildImageCSS(st.images, st.imgOp, vars['--horae-bg'], st.drawerBg)
        };
        const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `horae-${name}.json`; a.click();
        URL.revokeObjectURL(url);
        showToast('Тема экспортирована в JSON', 'info');
    }, { signal: sig });

    // ---- Reset ----
    modal.querySelector('#htd-reset').addEventListener('click', () => {
        st.hue = 265; st.sat = 84; st.colorLight = 50; st.bright = 25; st.accent = '#f59e0b';
        st.overrides = {}; st.drawerBg = '';
        st.rpgColor = '#000000'; st.rpgOpacity = 85;
        st.diceColor = '#1a1a2e'; st.diceOpacity = 15;
        st.images = { drawer: '', header: '', body: '', panel: '' };
        st.imgOp = { drawer: 30, header: 50, body: 30, panel: 30 };
        hueInd.style.left = `${(265 / 360) * 100}%`;
        hueInd.style.background = `hsl(265, 100%, 50%)`;
        modal.querySelector('#htd-sat').value = 84; modal.querySelector('#htd-satv').textContent = '84';
        modal.querySelector('#htd-cl').value = 50; modal.querySelector('#htd-clv').textContent = '50';
        modal.querySelector('#htd-bri').value = 25; modal.querySelector('#htd-briv').textContent = 'Ночь';
        modal.querySelector('#htd-accent').value = '#f59e0b';
        modal.querySelector('#htd-accent-hex').textContent = '#f59e0b';
        modal.querySelector('#htd-dbg-hex').textContent = 'По теме';
        modal.querySelector('#htd-rpg-color').value = '#000000';
        modal.querySelector('#htd-rpg-color-hex').textContent = '#000000';
        modal.querySelector('#htd-rpg-op').value = 85;
        modal.querySelector('#htd-rpg-opv').textContent = '85';
        modal.querySelector('#htd-dice-color').value = '#1a1a2e';
        modal.querySelector('#htd-dice-color-hex').textContent = '#1a1a2e';
        modal.querySelector('#htd-dice-op').value = 15;
        modal.querySelector('#htd-dice-opv').textContent = '15';
        ['drawer', 'header', 'body', 'panel'].forEach(k => {
            const u = modal.querySelector(`#htd-img-${k}`); if (u) u.value = '';
            const defOp = k === 'header' ? 50 : 30;
            const s = modal.querySelector(`#htd-imgsl-${k}`); if (s) s.value = defOp;
            const v = modal.querySelector(`#htd-imgop-${k}`); if (v) v.textContent = String(defOp);
            const p = modal.querySelector(`#htd-imgpv-${k}`); if (p) p.style.display = 'none';
        });
        const fBody = modal.querySelector('#htd-fine-body');
        if (fBody.style.display !== 'none') buildFine();
        update();
        showToast('Сброшено до значений по умолчанию', 'info');
    }, { signal: sig });

    update();
}

/**
 * Добавить панель метаданных к сообщению
 */
function addMessagePanel(messageEl, messageIndex) {
    const existingPanel = messageEl.querySelector('.horae-message-panel');
    if (existingPanel) return;
    
    const meta = horaeManager.getMessageMeta(messageIndex);
    if (!meta) return;
    
    // Форматирование времени (добавить день недели в стандартный календарь)
    let time = '--';
    if (meta.timestamp?.story_date) {
        const parsed = parseStoryDate(meta.timestamp.story_date);
        if (parsed && parsed.type === 'standard') {
            time = formatStoryDate(parsed, true);
        } else {
            time = meta.timestamp.story_date;
        }
        if (meta.timestamp.story_time) {
            time += ' ' + meta.timestamp.story_time;
        }
    }
    // Совместимость нового и старого формата событий
    const eventsArr = meta.events || (meta.event ? [meta.event] : []);
    const eventSummary = eventsArr.length > 0 
        ? eventsArr.map(e => e.summary).join(' | ') 
        : 'Нет особых событий';
    const charCount = meta.scene?.characters_present?.length || 0;
    const isSkipped = !!meta._skipHorae;
    const sideplayBtnStyle = settings.sideplayMode ? '' : 'display:none;';
    
    const panelHtml = `
        <div class="horae-message-panel${isSkipped ? ' horae-sideplay' : ''}" data-message-id="${messageIndex}">
            <div class="horae-panel-toggle">
                <div class="horae-panel-icon">
                    <i class="fa-regular ${isSkipped ? 'fa-eye-slash' : 'fa-clock'}"></i>
                </div>
                <div class="horae-panel-summary">
                    ${isSkipped ? '<span class="horae-sideplay-badge">Побочная</span>' : ''}
                    <span class="horae-summary-time">${isSkipped ? '(не отслеживается)' : time}</span>
                    <span class="horae-summary-divider">|</span>
                    <span class="horae-summary-event">${isSkipped ? 'Сообщение помечено как побочная сцена' : eventSummary}</span>
                    <span class="horae-summary-divider">|</span>
                    <span class="horae-summary-chars">${isSkipped ? '' : charCount + ' в сцене'}</span>
                </div>
                <div class="horae-panel-actions">
                    <button class="horae-btn-sideplay" title="${isSkipped ? 'Снять пометку побочной сцены' : 'Пометить как побочную сцену (не отслеживать)'}" style="${sideplayBtnStyle}">
                        <i class="fa-solid ${isSkipped ? 'fa-eye' : 'fa-masks-theater'}"></i>
                    </button>
                    <button class="horae-btn-rescan" title="Повторно сканировать сообщение">
                        <i class="fa-solid fa-rotate"></i>
                    </button>
                    <button class="horae-btn-expand" title="Развернуть/Свернуть">
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                </div>
            </div>
            <div class="horae-panel-content" style="display: none;">
                ${buildPanelContent(messageIndex, meta)}
            </div>
        </div>
    `;
    
    const mesTextEl = messageEl.querySelector('.mes_text');
    if (mesTextEl) {
        mesTextEl.insertAdjacentHTML('afterend', panelHtml);
        const panelEl = messageEl.querySelector('.horae-message-panel');
        bindPanelEvents(panelEl);
        if (!settings.showMessagePanel && panelEl) {
            panelEl.style.display = 'none';
        }
        // Применить пользовательские ширину и смещение
        const w = Math.max(50, Math.min(100, settings.panelWidth || 100));
        if (w < 100 && panelEl) {
            panelEl.style.maxWidth = `${w}%`;
        }
        const ofs = Math.max(0, settings.panelOffset || 0);
        if (ofs > 0 && panelEl) {
            panelEl.style.marginLeft = `${ofs}px`;
        }
        // Наследовать режим темы
        if (isLightMode() && panelEl) {
            panelEl.classList.add('horae-light');
        }
        // RPG HUD
        renderRpgHud(messageEl, messageIndex);
    }
}

/**
 * Построить отображение удалённых предметов
 */
function buildDeletedItemsDisplay(deletedItems) {
    if (!deletedItems || deletedItems.length === 0) {
        return '';
    }
    return deletedItems.map(item => `
        <div class="horae-deleted-item-tag">
            <i class="fa-solid fa-xmark"></i> ${item}
        </div>
    `).join('');
}

/**
 * Построить строку редактирования задачи
 */
function buildAgendaEditorRows(agenda) {
    if (!agenda || agenda.length === 0) {
        return '';
    }
    return agenda.map(item => `
        <div class="horae-editor-row horae-agenda-edit-row">
            <input type="text" class="agenda-date" style="flex:0 0 90px;max-width:90px;" value="${escapeHtml(item.date || '')}" placeholder="дата">
            <input type="text" class="agenda-text" style="flex:1 1 0;min-width:0;" value="${escapeHtml(item.text || '')}" placeholder="содержание задачи (для относительного времени укажите абсолютную дату)">
            <button class="delete-btn"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');
}

/** Рендеринг панели «Сеть отношений» — источник: chat[0].horae_meta, не расходует API */
function buildPanelRelationships(meta) {
    if (!settings.sendRelationships) return '';
    const presentChars = meta.scene?.characters_present || [];
    const rels = horaeManager.getRelationshipsForCharacters(presentChars);
    if (rels.length === 0) return '';
    
    const rows = rels.map(r => {
        const noteStr = r.note ? ` <span class="horae-rel-note-sm">(${r.note})</span>` : '';
        return `<div class="horae-panel-rel-row">${r.from} <span class="horae-rel-arrow-sm">→</span> ${r.to}: <strong>${r.type}</strong>${noteStr}</div>`;
    }).join('');
    
    return `
        <div class="horae-panel-row full-width">
            <label><i class="fa-solid fa-diagram-project"></i> Сеть отношений</label>
            <div class="horae-panel-relationships">${rows}</div>
        </div>`;
}

function buildPanelMoodEditable(meta) {
    if (!settings.sendMood) return '';
    const moodEntries = Object.entries(meta.mood || {});
    const rows = moodEntries.map(([char, emotion]) => `
        <div class="horae-editor-row horae-mood-row">
            <span class="mood-char">${escapeHtml(char)}</span>
            <input type="text" class="mood-emotion" value="${escapeHtml(emotion)}" placeholder="эмоциональное состояние">
            <button class="delete-btn"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');
    return `
        <div class="horae-panel-row full-width">
            <label><i class="fa-solid fa-face-smile"></i> Эмоциональное состояние</label>
            <div class="horae-mood-editor">${rows}</div>
            <button class="horae-btn-add-mood"><i class="fa-solid fa-plus"></i> Добавить</button>
        </div>`;
}

function buildPanelContent(messageIndex, meta) {
    const costumeRows = Object.entries(meta.costumes || {}).map(([char, costume]) => `
        <div class="horae-editor-row">
            <input type="text" class="char-input" value="${escapeHtml(char)}" placeholder="Имя персонажа">
            <input type="text" value="${escapeHtml(costume)}" placeholder="описание одежды">
            <button class="delete-btn"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `).join('');
    
    // Категории предметов управляются главной страницей, нижняя панель не показывает
    const itemRows = Object.entries(meta.items || {}).map(([name, info]) => {
        return `
            <div class="horae-editor-row horae-item-row">
                <input type="text" class="item-icon" value="${escapeHtml(info.icon || '')}" placeholder="📦" maxlength="2">
                <input type="text" class="item-name" value="${escapeHtml(name)}" placeholder="название предмета">
                <input type="text" class="item-holder" value="${escapeHtml(info.holder || '')}" placeholder="владелец">
                <input type="text" class="item-location" value="${escapeHtml(info.location || '')}" placeholder="местоположение">
                <button class="delete-btn"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="horae-editor-row horae-item-desc-row">
                <input type="text" class="item-description" value="${escapeHtml(info.description || '')}" placeholder="описание предмета">
            </div>
        `;
    }).join('');
    
    // Получить итоговое значение расположения из предыдущего сообщения
    const prevTotals = {};
    const chat = horaeManager.getChat();
    for (let i = 0; i < messageIndex; i++) {
        const m = chat[i]?.horae_meta;
        if (m?.affection) {
            for (const [k, v] of Object.entries(m.affection)) {
                    let val = 0;
                    if (typeof v === 'object' && v !== null) {
                        if (v.type === 'absolute') val = parseFloat(v.value) || 0;
                        else if (v.type === 'relative') val = (prevTotals[k] || 0) + (parseFloat(v.value) || 0);
                    } else {
                        val = (prevTotals[k] || 0) + (parseFloat(v) || 0);
                    }
                    prevTotals[k] = val;
                }
        }
    }
    
    const affectionRows = Object.entries(meta.affection || {}).map(([key, value]) => {
        // Разобрать значения текущего слоя
        let delta = 0, newTotal = 0;
        const prevVal = prevTotals[key] || 0;
        
        if (typeof value === 'object' && value !== null) {
            if (value.type === 'absolute') {
                newTotal = parseFloat(value.value) || 0;
                delta = newTotal - prevVal;
            } else if (value.type === 'relative') {
                delta = parseFloat(value.value) || 0;
                newTotal = prevVal + delta;
            }
        } else {
            delta = parseFloat(value) || 0;
            newTotal = prevVal + delta;
        }
        
        const roundedDelta = Math.round(delta * 100) / 100;
        const roundedTotal = Math.round(newTotal * 100) / 100;
        const deltaStr = roundedDelta >= 0 ? `+${roundedDelta}` : `${roundedDelta}`;
        return `
            <div class="horae-editor-row horae-affection-row" data-char="${escapeHtml(key)}" data-prev="${prevVal}">
                <span class="affection-char">${escapeHtml(key)}</span>
                <input type="text" class="affection-delta" value="${deltaStr}" placeholder="±изменение">
                <input type="number" class="affection-total" value="${roundedTotal}" placeholder="итого" step="any">
                <button class="delete-btn"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
    }).join('');
    
    // Совместимость нового и старого формата событий
    const eventsArr = meta.events || (meta.event ? [meta.event] : []);
    const firstEvent = eventsArr[0] || {};
    const eventLevel = firstEvent.level || '';
    const eventSummary = firstEvent.summary || '';
    const multipleEventsNote = eventsArr.length > 1 ? `<span class="horae-note">(В сообщении ${eventsArr.length} событий, показано первое)</span>` : '';
    
    return `
        <div class="horae-panel-grid">
            <div class="horae-panel-row">
                <label><i class="fa-regular fa-clock"></i> Время</label>
                <div class="horae-panel-value">
                    <input type="text" class="horae-input-datetime" placeholder="дата время (напр. 2026/2/4 15:00)" value="${escapeHtml((() => {
                        let val = meta.timestamp?.story_date || '';
                        if (meta.timestamp?.story_time) val += (val ? ' ' : '') + meta.timestamp.story_time;
                        return val;
                    })())}">
                </div>
            </div>
            <div class="horae-panel-row">
                <label><i class="fa-solid fa-location-dot"></i> Место</label>
                <div class="horae-panel-value">
                    <input type="text" class="horae-input-location" value="${escapeHtml(meta.scene?.location || '')}" placeholder="местоположение сцены">
                </div>
            </div>
            <div class="horae-panel-row">
                <label><i class="fa-solid fa-cloud"></i> Атмосфера</label>
                <div class="horae-panel-value">
                    <input type="text" class="horae-input-atmosphere" value="${escapeHtml(meta.scene?.atmosphere || '')}" placeholder="атмосфера сцены">
                </div>
            </div>
            <div class="horae-panel-row">
                <label><i class="fa-solid fa-users"></i> В сцене</label>
                <div class="horae-panel-value">
                    <input type="text" class="horae-input-characters" value="${escapeHtml((meta.scene?.characters_present || []).join(', '))}" placeholder="имена персонажей, через запятую">
                </div>
            </div>
            <div class="horae-panel-row full-width">
                <label><i class="fa-solid fa-shirt"></i> Смена одежды</label>
                <div class="horae-costume-editor">${costumeRows}</div>
                <button class="horae-btn-add-costume"><i class="fa-solid fa-plus"></i> Добавить</button>
            </div>
            ${buildPanelMoodEditable(meta)}
            <div class="horae-panel-row full-width">
                <label><i class="fa-solid fa-box-open"></i> Получение/смена предметов</label>
                <div class="horae-items-editor">${itemRows}</div>
                <button class="horae-btn-add-item"><i class="fa-solid fa-plus"></i> Добавить</button>
            </div>
            <div class="horae-panel-row full-width">
                <label><i class="fa-solid fa-trash-can"></i> Расход/удаление предметов</label>
                <div class="horae-deleted-items-display">${buildDeletedItemsDisplay(meta.deletedItems)}</div>
            </div>
            <div class="horae-panel-row full-width">
                <label><i class="fa-solid fa-bookmark"></i> Событие ${multipleEventsNote}</label>
                <div class="horae-event-editor">
                    <select class="horae-input-event-level">
                        <option value="">Нет</option>
                        <option value="一般" ${eventLevel === '一般' ? 'selected' : ''}>Обычное</option>
                        <option value="重要" ${eventLevel === '重要' ? 'selected' : ''}>Важное</option>
                        <option value="关键" ${eventLevel === '关键' ? 'selected' : ''}>Ключевое</option>
                    </select>
                    <input type="text" class="horae-input-event-summary" value="${escapeHtml(eventSummary)}" placeholder="краткое описание события">
                </div>
            </div>
            <div class="horae-panel-row full-width">
                <label><i class="fa-solid fa-heart"></i> Расположение</label>
                <div class="horae-affection-editor">${affectionRows}</div>
                <button class="horae-btn-add-affection"><i class="fa-solid fa-plus"></i> Добавить</button>
            </div>
            <div class="horae-panel-row full-width">
                <label><i class="fa-solid fa-list-check"></i> Задачи</label>
                <div class="horae-agenda-editor">${buildAgendaEditorRows(meta.agenda)}</div>
                <button class="horae-btn-add-agenda-row"><i class="fa-solid fa-plus"></i> Добавить</button>
            </div>
            ${buildPanelRelationships(meta)}
        </div>
        <div class="horae-panel-rescan">
            <div class="horae-rescan-label"><i class="fa-solid fa-rotate"></i> Повторно сканировать сообщение</div>
            <div class="horae-rescan-buttons">
                <button class="horae-btn-quick-scan horae-btn" title="Извлечь данные из существующего текста (без API)">
                    <i class="fa-solid fa-bolt"></i> Быстрый разбор
                </button>
                <button class="horae-btn-ai-analyze horae-btn" title="Использовать ИИ для анализа (расходует API)">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> ИИ-анализ
                </button>
            </div>
        </div>
        <div class="horae-panel-footer">
            <button class="horae-btn-save horae-btn"><i class="fa-solid fa-check"></i> Сохранить</button>
            <button class="horae-btn-cancel horae-btn"><i class="fa-solid fa-xmark"></i> Отмена</button>
            <button class="horae-btn-open-drawer horae-btn" title="Открыть панель Horae"><i class="fa-solid fa-clock-rotate-left"></i></button>
        </div>
    `;
}

/**
 * Привязать события панели
 */
function bindPanelEvents(panelEl) {
    if (!panelEl) return;
    
    const messageId = parseInt(panelEl.dataset.messageId);
    const contentEl = panelEl.querySelector('.horae-panel-content');
    
    // Событие шапки привязывается один раз, чтобы избежать взаимной отмены toggle
    if (!panelEl._horaeBound) {
        panelEl._horaeBound = true;
        const toggleEl = panelEl.querySelector('.horae-panel-toggle');
        const expandBtn = panelEl.querySelector('.horae-btn-expand');
        const rescanBtn = panelEl.querySelector('.horae-btn-rescan');
        
        const togglePanel = () => {
            const isHidden = contentEl.style.display === 'none';
            contentEl.style.display = isHidden ? 'block' : 'none';
            const icon = expandBtn?.querySelector('i');
            if (icon) icon.className = isHidden ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
        };
        
        const sideplayBtn = panelEl.querySelector('.horae-btn-sideplay');
        
        toggleEl?.addEventListener('click', (e) => {
            if (e.target.closest('.horae-btn-expand') || e.target.closest('.horae-btn-rescan') || e.target.closest('.horae-btn-sideplay')) return;
            togglePanel();
        });
        expandBtn?.addEventListener('click', togglePanel);
        rescanBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            rescanMessageMeta(messageId, panelEl);
        });
        sideplayBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSideplay(messageId, panelEl);
        });
    }
    
    // Пометить панель как изменённую
    let panelDirty = false;
    contentEl?.addEventListener('input', () => { panelDirty = true; });
    contentEl?.addEventListener('change', () => { panelDirty = true; });
    
    panelEl.querySelector('.horae-btn-save')?.addEventListener('click', () => {
        savePanelData(panelEl, messageId);
        panelDirty = false;
    });
    
    panelEl.querySelector('.horae-btn-cancel')?.addEventListener('click', () => {
        if (panelDirty && !confirm('Есть несохранённые изменения. Закрыть?')) return;
        contentEl.style.display = 'none';
        panelDirty = false;
    });
    
    panelEl.querySelector('.horae-btn-open-drawer')?.addEventListener('click', () => {
        const drawerIcon = $('#horae_drawer_icon');
        const drawerContent = $('#horae_drawer_content');
        const isOpen = drawerIcon.hasClass('openIcon');
        if (isOpen) {
            drawerIcon.removeClass('openIcon').addClass('closedIcon');
            drawerContent.removeClass('openDrawer').addClass('closedDrawer').css('display', 'none');
        } else {
            // Закрыть другие ящики
            $('.openDrawer').not('#horae_drawer_content').not('.pinnedOpen').css('display', 'none')
                .removeClass('openDrawer').addClass('closedDrawer');
            $('.openIcon').not('#horae_drawer_icon').not('.drawerPinnedOpen')
                .removeClass('openIcon').addClass('closedIcon');
            drawerIcon.removeClass('closedIcon').addClass('openIcon');
            drawerContent.removeClass('closedDrawer').addClass('openDrawer').css('display', '');
        }
    });
    
    panelEl.querySelector('.horae-btn-add-costume')?.addEventListener('click', () => {
        const editor = panelEl.querySelector('.horae-costume-editor');
        const emptyHint = editor.querySelector('.horae-empty-hint');
        if (emptyHint) emptyHint.remove();
        
        editor.insertAdjacentHTML('beforeend', `
            <div class="horae-editor-row">
                <input type="text" class="char-input" placeholder="Имя персонажа">
                <input type="text" placeholder="описание одежды">
                <button class="delete-btn"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `);
        bindDeleteButtons(editor);
    });
    
    panelEl.querySelector('.horae-btn-add-mood')?.addEventListener('click', () => {
        const editor = panelEl.querySelector('.horae-mood-editor');
        if (!editor) return;
        editor.insertAdjacentHTML('beforeend', `
            <div class="horae-editor-row horae-mood-row">
                <input type="text" class="mood-char" placeholder="Имя персонажа">
                <input type="text" class="mood-emotion" placeholder="эмоциональное состояние">
                <button class="delete-btn"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `);
        bindDeleteButtons(editor);
    });
    
    panelEl.querySelector('.horae-btn-add-item')?.addEventListener('click', () => {
        const editor = panelEl.querySelector('.horae-items-editor');
        const emptyHint = editor.querySelector('.horae-empty-hint');
        if (emptyHint) emptyHint.remove();
        
        editor.insertAdjacentHTML('beforeend', `
            <div class="horae-editor-row horae-item-row">
                <input type="text" class="item-icon" placeholder="📦" maxlength="2">
                <input type="text" class="item-name" placeholder="название предмета">
                <input type="text" class="item-holder" placeholder="владелец">
                <input type="text" class="item-location" placeholder="местоположение">
                <button class="delete-btn"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="horae-editor-row horae-item-desc-row">
                <input type="text" class="item-description" placeholder="описание предмета">
            </div>
        `);
        bindDeleteButtons(editor);
    });
    
    panelEl.querySelector('.horae-btn-add-affection')?.addEventListener('click', () => {
        const editor = panelEl.querySelector('.horae-affection-editor');
        const emptyHint = editor.querySelector('.horae-empty-hint');
        if (emptyHint) emptyHint.remove();
        
        editor.insertAdjacentHTML('beforeend', `
            <div class="horae-editor-row horae-affection-row" data-char="" data-prev="0">
                <input type="text" class="affection-char-input" placeholder="Имя персонажа">
                <input type="text" class="affection-delta" value="+0" placeholder="±изменение">
                <input type="number" class="affection-total" value="0" placeholder="итого">
                <button class="delete-btn"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `);
        bindDeleteButtons(editor);
        bindAffectionInputs(editor);
    });
    
    // Добавить строку задачи
    panelEl.querySelector('.horae-btn-add-agenda-row')?.addEventListener('click', () => {
        const editor = panelEl.querySelector('.horae-agenda-editor');
        const emptyHint = editor.querySelector('.horae-empty-hint');
        if (emptyHint) emptyHint.remove();
        
        editor.insertAdjacentHTML('beforeend', `
            <div class="horae-editor-row horae-agenda-edit-row">
                <input type="text" class="agenda-date" style="flex:0 0 90px;max-width:90px;" value="" placeholder="дата">
                <input type="text" class="agenda-text" style="flex:1 1 0;min-width:0;" value="" placeholder="содержание задачи (для относительного времени укажите абсолютную дату)">
                <button class="delete-btn"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `);
        bindDeleteButtons(editor);
    });
    
    // Привязать взаимосвязь полей расположения
    bindAffectionInputs(panelEl.querySelector('.horae-affection-editor'));
    
    // Привязать существующие кнопки удаления
    bindDeleteButtons(panelEl);
    
    // Кнопка быстрого разбора (без расхода API)
    panelEl.querySelector('.horae-btn-quick-scan')?.addEventListener('click', async () => {
        const chat = horaeManager.getChat();
        const message = chat[messageId];
        if (!message) {
            showToast('Не удалось получить содержимое сообщения', 'error');
            return;
        }
        
        // Сначала попробовать разобрать стандартные теги
        let parsed = horaeManager.parseHoraeTag(message.mes);
        
        // Если нет тегов, попробовать нестрогий разбор
        if (!parsed) {
            parsed = horaeManager.parseLooseFormat(message.mes);
        }
        
        if (parsed) {
            // Получить существующие метаданные и объединить
            const existingMeta = horaeManager.getMessageMeta(messageId) || createEmptyMeta();
            const newMeta = horaeManager.mergeParsedToMeta(existingMeta, parsed);
            // Обработать обновление таблиц
            if (newMeta._tableUpdates) {
                horaeManager.applyTableUpdates(newMeta._tableUpdates);
                delete newMeta._tableUpdates;
            }
            // Обработать выполненные задачи
            if (parsed.deletedAgenda && parsed.deletedAgenda.length > 0) {
                horaeManager.removeCompletedAgenda(parsed.deletedAgenda);
            }
            // Глобальная синхронизация
            if (parsed.relationships?.length > 0) {
                horaeManager._mergeRelationships(parsed.relationships);
            }
            if (parsed.scene?.scene_desc && parsed.scene?.location) {
                horaeManager._updateLocationMemory(parsed.scene.location, parsed.scene.scene_desc);
            }
            horaeManager.setMessageMeta(messageId, newMeta);
            
            const contentEl = panelEl.querySelector('.horae-panel-content');
            if (contentEl) {
                contentEl.innerHTML = buildPanelContent(messageId, newMeta);
                bindPanelEvents(panelEl);
            }
            
            getContext().saveChat();
            refreshAllDisplays();
            showToast('Быстрый разбор завершён!', 'success');
        } else {
            showToast('Не удалось извлечь данные из текста, попробуйте ИИ-анализ', 'warning');
        }
    });
    
    // Кнопка ИИ-анализа (расходует API)
    panelEl.querySelector('.horae-btn-ai-analyze')?.addEventListener('click', async () => {
        const chat = horaeManager.getChat();
        const message = chat[messageId];
        if (!message) {
            showToast('Не удалось получить содержимое сообщения', 'error');
            return;
        }
        
        const btn = panelEl.querySelector('.horae-btn-ai-analyze');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Анализ...';
        btn.disabled = true;
        
        try {
            // Вызов ИИ-анализа
            const result = await analyzeMessageWithAI(message.mes);
            
            if (result) {
                const existingMeta = horaeManager.getMessageMeta(messageId) || createEmptyMeta();
                const newMeta = horaeManager.mergeParsedToMeta(existingMeta, result);
                if (newMeta._tableUpdates) {
                    horaeManager.applyTableUpdates(newMeta._tableUpdates);
                    delete newMeta._tableUpdates;
                }
                // Обработать выполненные задачи
                if (result.deletedAgenda && result.deletedAgenda.length > 0) {
                    horaeManager.removeCompletedAgenda(result.deletedAgenda);
                }
                // Глобальная синхронизация
                if (result.relationships?.length > 0) {
                    horaeManager._mergeRelationships(result.relationships);
                }
                if (result.scene?.scene_desc && result.scene?.location) {
                    horaeManager._updateLocationMemory(result.scene.location, result.scene.scene_desc);
                }
                horaeManager.setMessageMeta(messageId, newMeta);
                
                const contentEl = panelEl.querySelector('.horae-panel-content');
                if (contentEl) {
                    contentEl.innerHTML = buildPanelContent(messageId, newMeta);
                    bindPanelEvents(panelEl);
                }
                
                getContext().saveChat();
                refreshAllDisplays();
                showToast('ИИ-анализ завершён!', 'success');
            } else {
                showToast('ИИ-анализ не вернул данных', 'warning');
            }
        } catch (error) {
            console.error('[Horae] Ошибка ИИ-анализа:', error);
            showToast('Ошибка ИИ-анализа: ' + error.message, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

/**
 * Привязать события кнопок удаления
 */
function bindDeleteButtons(container) {
    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = () => btn.closest('.horae-editor-row')?.remove();
    });
}

/**
 * Привязать взаимосвязанные поля расположения
 */
function bindAffectionInputs(container) {
    if (!container) return;
    
    container.querySelectorAll('.horae-affection-row').forEach(row => {
        const deltaInput = row.querySelector('.affection-delta');
        const totalInput = row.querySelector('.affection-total');
        const prevVal = parseFloat(row.dataset.prev) || 0;
        
        deltaInput?.addEventListener('input', () => {
            const deltaStr = deltaInput.value.replace(/[^\d\.\-+]/g, '');
            const delta = parseFloat(deltaStr) || 0;
            totalInput.value = parseFloat((prevVal + delta).toFixed(2));
        });
        
        totalInput?.addEventListener('input', () => {
            const total = parseFloat(totalInput.value) || 0;
            const delta = parseFloat((total - prevVal).toFixed(2));
            deltaInput.value = delta >= 0 ? `+${delta}` : `${delta}`;
        });
    });
}

/** Переключить метку побочной сцены для сообщения */
function toggleSideplay(messageId, panelEl) {
    const meta = horaeManager.getMessageMeta(messageId);
    if (!meta) return;
    const wasSkipped = !!meta._skipHorae;
    meta._skipHorae = !wasSkipped;
    horaeManager.setMessageMeta(messageId, meta);
    getContext().saveChat();
    
    // Перестроить панель
    const messageEl = panelEl.closest('.mes');
    if (messageEl) {
        panelEl.remove();
        addMessagePanel(messageEl, messageId);
    }
    refreshAllDisplays();
    showToast(meta._skipHorae ? 'Помечено как побочная сцена (не отслеживается)' : 'Метка побочной сцены снята', 'success');
}

/** Повторно сканировать сообщение и обновить панель (полная замена) */
function rescanMessageMeta(messageId, panelEl) {
    // Получить последнее содержимое сообщения из DOM (пользователь мог редактировать)
    const messageEl = panelEl.closest('.mes');
    if (!messageEl) {
        showToast('Элемент сообщения не найден', 'error');
        return;
    }
    
    // Получить текстовое содержимое (включая скрытые теги horae)
    // Сначала попытаться получить последнее содержимое из массива chat
    const context = window.SillyTavern?.getContext?.() || getContext?.();
    let messageContent = '';
    
    if (context?.chat?.[messageId]) {
        messageContent = context.chat[messageId].mes;
    }
    
    // Если в chat нет или пусто, получить из DOM
    if (!messageContent) {
        const mesTextEl = messageEl.querySelector('.mes_text');
        if (mesTextEl) {
            messageContent = mesTextEl.innerHTML;
        }
    }
    
    if (!messageContent) {
        showToast('Не удалось получить содержимое сообщения', 'error');
        return;
    }
    
    const parsed = horaeManager.parseHoraeTag(messageContent);
    
    if (parsed) {
        const existingMeta = horaeManager.getMessageMeta(messageId);
        // Использовать mergeParsedToMeta с пустым meta как основой для единообразной обработки всех полей
        const newMeta = horaeManager.mergeParsedToMeta(createEmptyMeta(), parsed);
        
        // Сохранить только исходные данные NPC (если в новом разборе их нет)
        if ((!parsed.npcs || Object.keys(parsed.npcs).length === 0) && existingMeta?.npcs) {
            newMeta.npcs = existingMeta.npcs;
        }
        
        // Если нет новых задач, сохранить старые данные
        if ((!newMeta.agenda || newMeta.agenda.length === 0) && existingMeta?.agenda?.length > 0) {
            newMeta.agenda = existingMeta.agenda;
        }
        
        // Обработать обновление таблиц
        if (newMeta._tableUpdates) {
            horaeManager.applyTableUpdates(newMeta._tableUpdates);
            delete newMeta._tableUpdates;
        }
        
        // Обработать выполненные задачи
        if (parsed.deletedAgenda && parsed.deletedAgenda.length > 0) {
            horaeManager.removeCompletedAgenda(parsed.deletedAgenda);
        }
        
        // Глобальная синхронизация: слить сеть отношений в chat[0]
        if (parsed.relationships?.length > 0) {
            horaeManager._mergeRelationships(parsed.relationships);
        }
        // Глобальная синхронизация: обновить память о локациях
        if (parsed.scene?.scene_desc && parsed.scene?.location) {
            horaeManager._updateLocationMemory(parsed.scene.location, parsed.scene.scene_desc);
        }
        
        horaeManager.setMessageMeta(messageId, newMeta);
        getContext().saveChat();
        
        panelEl.remove();
        addMessagePanel(messageEl, messageId);
        
        // Одновременно обновить главное отображение
        refreshAllDisplays();
        
        showToast('Повторное сканирование выполнено и обновлено', 'success');
    } else {
        // Нет тегов, очистить данные (сохранить NPC)
        const existingMeta = horaeManager.getMessageMeta(messageId);
        const newMeta = createEmptyMeta();
        if (existingMeta?.npcs) {
            newMeta.npcs = existingMeta.npcs;
        }
        horaeManager.setMessageMeta(messageId, newMeta);
        
        panelEl.remove();
        addMessagePanel(messageEl, messageId);
        refreshAllDisplays();
        
        showToast('Теги Horae не найдены, данные очищены', 'warning');
    }
}

/**
 * Сохранить данные панели
 */
function savePanelData(panelEl, messageId) {
    // Получить существующий meta, сохранить данные без редактируемых областей в панели (например, NPC)
    const existingMeta = horaeManager.getMessageMeta(messageId);
    const meta = createEmptyMeta();
    
    // Сохранить данные без редактируемых областей в панели
    if (existingMeta?.npcs) {
        meta.npcs = JSON.parse(JSON.stringify(existingMeta.npcs));
    }
    if (existingMeta?.relationships?.length) {
        meta.relationships = JSON.parse(JSON.stringify(existingMeta.relationships));
    }
    if (existingMeta?.scene?.scene_desc) {
        meta.scene.scene_desc = existingMeta.scene.scene_desc;
    }
    if (existingMeta?.mood && Object.keys(existingMeta.mood).length > 0) {
        meta.mood = JSON.parse(JSON.stringify(existingMeta.mood));
    }
    
    // Разделить дату и время
    const datetimeVal = (panelEl.querySelector('.horae-input-datetime')?.value || '').trim();
    const clockMatch = datetimeVal.match(/\b(\d{1,2}:\d{2})\s*$/);
    if (clockMatch) {
        meta.timestamp.story_time = clockMatch[1];
        meta.timestamp.story_date = datetimeVal.substring(0, datetimeVal.lastIndexOf(clockMatch[1])).trim();
    } else {
        meta.timestamp.story_date = datetimeVal;
        meta.timestamp.story_time = '';
    }
    meta.timestamp.absolute = new Date().toISOString();
    
    // Сцена
    meta.scene.location = panelEl.querySelector('.horae-input-location')?.value || '';
    meta.scene.atmosphere = panelEl.querySelector('.horae-input-atmosphere')?.value || '';
    const charsInput = panelEl.querySelector('.horae-input-characters')?.value || '';
    meta.scene.characters_present = charsInput.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    
    // Одежда
    panelEl.querySelectorAll('.horae-costume-editor .horae-editor-row').forEach(row => {
        const inputs = row.querySelectorAll('input');
        if (inputs.length >= 2) {
            const char = inputs[0].value.trim();
            const costume = inputs[1].value.trim();
            if (char && costume) {
                meta.costumes[char] = costume;
            }
        }
    });
    
    // Эмоции
    panelEl.querySelectorAll('.horae-mood-editor .horae-mood-row').forEach(row => {
        const charEl = row.querySelector('.mood-char');
        const emotionInput = row.querySelector('.mood-emotion');
        const char = (charEl?.tagName === 'INPUT' ? charEl.value : charEl?.textContent)?.trim();
        const emotion = emotionInput?.value?.trim();
        if (char && emotion) meta.mood[char] = emotion;
    });
    
    // Обработка пар предметов
    const itemMainRows = panelEl.querySelectorAll('.horae-items-editor .horae-item-row');
    const itemDescRows = panelEl.querySelectorAll('.horae-items-editor .horae-item-desc-row');
    const latestState = horaeManager.getLatestState();
    const existingItems = latestState.items || {};
    
    itemMainRows.forEach((row, idx) => {
        const iconInput = row.querySelector('.item-icon');
        const nameInput = row.querySelector('.item-name');
        const holderInput = row.querySelector('.item-holder');
        const locationInput = row.querySelector('.item-location');
        const descRow = itemDescRows[idx];
        const descInput = descRow?.querySelector('.item-description');
        
        if (nameInput) {
            const name = nameInput.value.trim();
            if (name) {
                // Получить сохранённую важность из инвентаря, нижняя панель больше не редактирует классификацию
                const existingImportance = existingItems[name]?.importance || existingMeta?.items?.[name]?.importance || '';
                meta.items[name] = {
                    icon: iconInput?.value.trim() || null,
                    importance: existingImportance,  // Сохранить классификацию инвентаря
                    holder: holderInput?.value.trim() || null,
                    location: locationInput?.value.trim() || '',
                    description: descInput?.value.trim() || ''
                };
            }
        }
    });
    
    // Событие
    const eventLevel = panelEl.querySelector('.horae-input-event-level')?.value;
    const eventSummary = panelEl.querySelector('.horae-input-event-summary')?.value;
    if (eventLevel && eventSummary) {
        meta.events = [{
            is_important: eventLevel === '重要' || eventLevel === '关键',
            level: eventLevel,
            summary: eventSummary
        }];
    }
    
    panelEl.querySelectorAll('.horae-affection-editor .horae-affection-row').forEach(row => {
        const charSpan = row.querySelector('.affection-char');
        const charInput = row.querySelector('.affection-char-input');
        const totalInput = row.querySelector('.affection-total');
        
        const key = charSpan?.textContent?.trim() || charInput?.value?.trim() || '';
        const total = parseFloat(totalInput?.value) || 0;
        
        if (key) {
            meta.affection[key] = { type: 'absolute', value: total };
        }
    });
    
    // Совместимость со старым форматом
    panelEl.querySelectorAll('.horae-affection-editor .horae-editor-row:not(.horae-affection-row)').forEach(row => {
        const inputs = row.querySelectorAll('input');
        if (inputs.length >= 2) {
            const key = inputs[0].value.trim();
            const value = inputs[1].value.trim();
            if (key && value) {
                meta.affection[key] = value;
            }
        }
    });
    
    const agendaItems = [];
    panelEl.querySelectorAll('.horae-agenda-editor .horae-agenda-edit-row').forEach(row => {
        const dateInput = row.querySelector('.agenda-date');
        const textInput = row.querySelector('.agenda-text');
        const date = dateInput?.value?.trim() || '';
        const text = textInput?.value?.trim() || '';
        if (text) {
            // Сохранить исходный source
            const existingAgendaItem = existingMeta?.agenda?.find(a => a.text === text);
            const source = existingAgendaItem?.source || 'user';
            agendaItems.push({ date, text, source, done: false });
        }
    });
    if (agendaItems.length > 0) {
        meta.agenda = agendaItems;
    } else if (existingMeta?.agenda?.length > 0) {
        // При отсутствии редактируемых строк сохранить исходные задачи
        meta.agenda = existingMeta.agenda;
    }
    
    horaeManager.setMessageMeta(messageId, meta);
    
    // Глобальная синхронизация
    if (meta.relationships?.length > 0) {
        horaeManager._mergeRelationships(meta.relationships);
    }
    if (meta.scene?.scene_desc && meta.scene?.location) {
        horaeManager._updateLocationMemory(meta.scene.location, meta.scene.scene_desc);
    }
    
    // Синхронно записать теги в основной текст
    injectHoraeTagToMessage(messageId, meta);
    
    getContext().saveChat();
    
    showToast('Сохранено успешно!', 'success');
    refreshAllDisplays();
    
    // Обновить краткое описание панели
    const summaryTime = panelEl.querySelector('.horae-summary-time');
    const summaryEvent = panelEl.querySelector('.horae-summary-event');
    const summaryChars = panelEl.querySelector('.horae-summary-chars');
    
    if (summaryTime) {
        if (meta.timestamp.story_date) {
            const parsed = parseStoryDate(meta.timestamp.story_date);
            let dateDisplay = meta.timestamp.story_date;
            if (parsed && parsed.type === 'standard') {
                dateDisplay = formatStoryDate(parsed, true);
            }
            summaryTime.textContent = dateDisplay + (meta.timestamp.story_time ? ' ' + meta.timestamp.story_time : '');
        } else {
            summaryTime.textContent = '--';
        }
    }
    if (summaryEvent) {
        const evts = meta.events || (meta.event ? [meta.event] : []);
        summaryEvent.textContent = evts.length > 0 ? evts.map(e => e.summary).join(' | ') : 'Нет особых событий';
    }
    if (summaryChars) {
        summaryChars.textContent = `${meta.scene.characters_present.length} в сцене`;
    }
}

/** Построить строку тега <horae> */
function buildHoraeTagFromMeta(meta) {
    const lines = [];
    
    if (meta.timestamp?.story_date) {
        let timeLine = `time:${meta.timestamp.story_date}`;
        if (meta.timestamp.story_time) timeLine += ` ${meta.timestamp.story_time}`;
        lines.push(timeLine);
    }
    
    if (meta.scene?.location) {
        lines.push(`location:${meta.scene.location}`);
    }
    
    if (meta.scene?.atmosphere) {
        lines.push(`atmosphere:${meta.scene.atmosphere}`);
    }
    
    if (meta.scene?.characters_present?.length > 0) {
        lines.push(`characters:${meta.scene.characters_present.join(',')}`);
    }
    
    if (meta.costumes) {
        for (const [char, costume] of Object.entries(meta.costumes)) {
            if (char && costume) {
                lines.push(`costume:${char}=${costume}`);
            }
        }
    }
    
    if (meta.items) {
        for (const [name, info] of Object.entries(meta.items)) {
            if (!name) continue;
            const imp = info.importance === '!!' ? '!!' : info.importance === '!' ? '!' : '';
            const icon = info.icon || '';
            const desc = info.description ? `|${info.description}` : '';
            const holder = info.holder || '';
            const loc = info.location ? `@${info.location}` : '';
            lines.push(`item${imp}:${icon}${name}${desc}=${holder}${loc}`);
        }
    }
    
    // deleted items
    if (meta.deletedItems?.length > 0) {
        for (const item of meta.deletedItems) {
            lines.push(`item-:${item}`);
        }
    }
    
    if (meta.affection) {
        for (const [name, value] of Object.entries(meta.affection)) {
            if (!name) continue;
            if (typeof value === 'object') {
                if (value.type === 'relative') {
                    lines.push(`affection:${name}${value.value}`);
                } else {
                    lines.push(`affection:${name}=${value.value}`);
                }
            } else {
                lines.push(`affection:${name}=${value}`);
            }
        }
    }
    
    // NPC (новый формат: npc:имя|внешность=характер@отношения~доп.поля)
    if (meta.npcs) {
        for (const [name, info] of Object.entries(meta.npcs)) {
            if (!name) continue;
            const app = info.appearance || '';
            const per = info.personality || '';
            const rel = info.relationship || '';
            let npcLine = '';
            if (app || per || rel) {
                npcLine = `npc:${name}|${app}=${per}@${rel}`;
            } else {
                npcLine = `npc:${name}`;
            }
            const extras = [];
            if (info.gender) extras.push(`性别:${info.gender}`);
            if (info.age) extras.push(`年龄:${info.age}`);
            if (info.race) extras.push(`种族:${info.race}`);
            if (info.job) extras.push(`职业:${info.job}`);
            if (info.note) extras.push(`补充:${info.note}`);
            if (extras.length > 0) npcLine += `~${extras.join('~')}`;
            lines.push(npcLine);
        }
    }
    
    if (meta.agenda?.length > 0) {
        for (const item of meta.agenda) {
            if (item.text) {
                const datePart = item.date ? `${item.date}|` : '';
                lines.push(`agenda:${datePart}${item.text}`);
            }
        }
    }

    if (meta.relationships?.length > 0) {
        for (const r of meta.relationships) {
            if (r.from && r.to && r.type) {
                lines.push(`rel:${r.from}>${r.to}=${r.type}${r.note ? '|' + r.note : ''}`);
            }
        }
    }

    if (meta.mood && Object.keys(meta.mood).length > 0) {
        for (const [char, emotion] of Object.entries(meta.mood)) {
            if (char && emotion) lines.push(`mood:${char}=${emotion}`);
        }
    }

    if (meta.scene?.scene_desc) {
        lines.push(`scene_desc:${meta.scene.scene_desc}`);
    }
    
    if (lines.length === 0) return '';
    return `<horae>\n${lines.join('\n')}\n</horae>`;
}

/** Построить строку тега <horaeevent> */
function buildHoraeEventTagFromMeta(meta) {
    const events = meta.events || (meta.event ? [meta.event] : []);
    if (events.length === 0) return '';
    
    const lines = events
        .filter(e => e.summary)
        .map(e => `event:${e.level || '一般'}|${e.summary}`);
    
    if (lines.length === 0) return '';
    return `<horaeevent>\n${lines.join('\n')}\n</horaeevent>`;
}

/** Синхронно внедрить теги в основной текст */
function injectHoraeTagToMessage(messageId, meta) {
    try {
        const chat = horaeManager.getChat();
        if (!chat?.[messageId]) return;
        
        const message = chat[messageId];
        let mes = message.mes;
        
        // === Обработка тега <horae> ===
        const newHoraeTag = buildHoraeTagFromMeta(meta);
        const hasHoraeTag = /<horae>[\s\S]*?<\/horae>/i.test(mes);
        
        if (hasHoraeTag) {
            mes = newHoraeTag
                ? mes.replace(/<horae>[\s\S]*?<\/horae>/gi, newHoraeTag)
                : mes.replace(/<horae>[\s\S]*?<\/horae>/gi, '').trim();
        } else if (newHoraeTag) {
            mes = mes.trimEnd() + '\n\n' + newHoraeTag;
        }
        
        // === Обработка тега <horaeevent> ===
        const newEventTag = buildHoraeEventTagFromMeta(meta);
        const hasEventTag = /<horaeevent>[\s\S]*?<\/horaeevent>/i.test(mes);
        
        if (hasEventTag) {
            mes = newEventTag
                ? mes.replace(/<horaeevent>[\s\S]*?<\/horaeevent>/gi, newEventTag)
                : mes.replace(/<horaeevent>[\s\S]*?<\/horaeevent>/gi, '').trim();
        } else if (newEventTag) {
            mes = mes.trimEnd() + '\n' + newEventTag;
        }
        
        message.mes = mes;
        console.log(`[Horae] Теги синхронно записаны в сообщение #${messageId}`);
    } catch (error) {
        console.error(`[Horae] Ошибка записи тегов:`, error);
    }
}

// ============================================
// Взаимодействие с панелью-ящиком
// ============================================

/**
 * Открыть/закрыть ящик (режим совместимости со старой версией)
 */
function openDrawerLegacy() {
    const drawerIcon = $('#horae_drawer_icon');
    const drawerContent = $('#horae_drawer_content');
    
    if (drawerIcon.hasClass('closedIcon')) {
        // Закрыть другие ящики
        $('.openDrawer').not('#horae_drawer_content').not('.pinnedOpen').addClass('resizing').each((_, el) => {
            slideToggle(el, {
                ...getSlideToggleOptions(),
                onAnimationEnd: (elem) => elem.closest('.drawer-content')?.classList.remove('resizing'),
            });
        });
        $('.openIcon').not('#horae_drawer_icon').not('.drawerPinnedOpen').toggleClass('closedIcon openIcon');
        $('.openDrawer').not('#horae_drawer_content').not('.pinnedOpen').toggleClass('closedDrawer openDrawer');

        drawerIcon.toggleClass('closedIcon openIcon');
        drawerContent.toggleClass('closedDrawer openDrawer');

        drawerContent.addClass('resizing').each((_, el) => {
            slideToggle(el, {
                ...getSlideToggleOptions(),
                onAnimationEnd: (elem) => elem.closest('.drawer-content')?.classList.remove('resizing'),
            });
        });
    } else {
        drawerIcon.toggleClass('openIcon closedIcon');
        drawerContent.toggleClass('openDrawer closedDrawer');

        drawerContent.addClass('resizing').each((_, el) => {
            slideToggle(el, {
                ...getSlideToggleOptions(),
                onAnimationEnd: (elem) => elem.closest('.drawer-content')?.classList.remove('resizing'),
            });
        });
    }
}

/**
 * Инициализировать ящик
 */
async function initDrawer() {
    const toggle = $('#horae_drawer .drawer-toggle');
    
    if (isNewNavbarVersion()) {
        toggle.on('click', doNavbarIconClick);
        console.log(`[Horae] Используется новый режим навигационной панели`);
    } else {
        $('#horae_drawer_content').attr('data-slide-toggle', 'hidden').css('display', 'none');
        toggle.on('click', openDrawerLegacy);
        console.log(`[Horae] Используется устаревший режим ящика`);
    }
}

/**
 * Инициализировать переключение вкладок
 */
function initTabs() {
    $('.horae-tab').on('click', function() {
        const tabId = $(this).data('tab');
        
        $('.horae-tab').removeClass('active');
        $(this).addClass('active');
        
        $('.horae-tab-content').removeClass('active');
        $(`#horae-tab-${tabId}`).addClass('active');
        
        switch(tabId) {
            case 'status':
                updateStatusDisplay();
                break;
            case 'timeline':
                updateAgendaDisplay();
                updateTimelineDisplay();
                break;
            case 'characters':
                updateCharactersDisplay();
                break;
            case 'items':
                updateItemsDisplay();
                break;
        }
    });
}

// ============================================
// Функция очистки бесхозных предметов
// ============================================

/**
 * Инициализировать события страницы настроек
 */
function initSettingsEvents() {
    $('#horae-btn-restart-tutorial').on('click', () => startTutorial());
    
    $('#horae-setting-enabled').on('change', function() {
        settings.enabled = this.checked;
        saveSettings();
    });
    
    $('#horae-setting-auto-parse').on('change', function() {
        settings.autoParse = this.checked;
        saveSettings();
    });
    
    $('#horae-setting-inject-context').on('change', function() {
        settings.injectContext = this.checked;
        saveSettings();
    });
    
    $('#horae-setting-show-panel').on('change', function() {
        settings.showMessagePanel = this.checked;
        saveSettings();
        document.querySelectorAll('.horae-message-panel').forEach(panel => {
            panel.style.display = this.checked ? '' : 'none';
        });
    });
    
    $('#horae-setting-show-top-icon').on('change', function() {
        settings.showTopIcon = this.checked;
        saveSettings();
        applyTopIconVisibility();
    });
    
    $('#horae-setting-context-depth').on('change', function() {
        settings.contextDepth = parseInt(this.value);
        if (isNaN(settings.contextDepth) || settings.contextDepth < 0) settings.contextDepth = 15;
        saveSettings();
        horaeManager.init(getContext(), settings);
        updateTokenCounter();
    });
    
    $('#horae-setting-injection-position').on('change', function() {
        settings.injectionPosition = parseInt(this.value) || 1;
        saveSettings();
    });
    
    $('#horae-btn-scan-all, #horae-btn-scan-history').on('click', scanHistoryWithProgress);
    $('#horae-btn-ai-scan').on('click', batchAIScan);
    $('#horae-btn-undo-ai-scan').on('click', undoAIScan);
    
    $('#horae-btn-fix-summaries').on('click', () => {
        const result = repairAllSummaryStates();
        if (result > 0) {
            updateTimelineDisplay();
            showToast(`Исправлено ${result} состояний сводки`, 'success');
        } else {
            showToast('Все состояния сводок в норме, исправление не требуется', 'info');
        }
    });
    
    $('#horae-timeline-filter').on('change', updateTimelineDisplay);
    $('#horae-timeline-search').on('input', updateTimelineDisplay);
    
    $('#horae-btn-add-agenda').on('click', () => openAgendaEditModal(null));
    $('#horae-btn-add-relationship').on('click', () => openRelationshipEditModal(null));
    $('#horae-btn-add-location').on('click', () => openLocationEditModal(null));
    $('#horae-btn-merge-locations').on('click', openLocationMergeModal);

    // Конфигурация полос атрибутов RPG
    $(document).on('input', '.horae-rpg-config-key', function() {
        const i = parseInt(this.dataset.idx);
        if (settings.rpgBarConfig?.[i]) {
            const val = this.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
            if (val) settings.rpgBarConfig[i].key = val;
            saveSettings();
            horaeManager.init(getContext(), settings);
            _refreshSystemPromptDisplay();
            updateTokenCounter();
        }
    });
    $(document).on('input', '.horae-rpg-config-name', function() {
        const i = parseInt(this.dataset.idx);
        if (settings.rpgBarConfig?.[i]) {
            settings.rpgBarConfig[i].name = this.value.trim() || settings.rpgBarConfig[i].key.toUpperCase();
            saveSettings();
            horaeManager.init(getContext(), settings);
            _refreshSystemPromptDisplay();
            updateTokenCounter();
        }
    });
    $(document).on('input', '.horae-rpg-config-color', function() {
        const i = parseInt(this.dataset.idx);
        if (settings.rpgBarConfig?.[i]) {
            settings.rpgBarConfig[i].color = this.value;
            saveSettings();
        }
    });
    $(document).on('click', '.horae-rpg-config-del', function() {
        const i = parseInt(this.dataset.idx);
        if (settings.rpgBarConfig?.[i]) {
            settings.rpgBarConfig.splice(i, 1);
            saveSettings();
            renderBarConfig();
            horaeManager.init(getContext(), settings);
            _refreshSystemPromptDisplay();
            updateTokenCounter();
        }
    });
    // Полосы атрибутов: сброс по умолчанию
    $('#horae-rpg-bar-reset').on('click', () => {
        if (!confirm('Сбросить полосы атрибутов до конфигурации по умолчанию (HP/MP/SP)?')) return;
        settings.rpgBarConfig = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.rpgBarConfig));
        saveSettings(); renderBarConfig();
        horaeManager.init(getContext(), settings); _refreshSystemPromptDisplay(); updateTokenCounter();
        showToast('Полосы атрибутов сброшены до значений по умолчанию', 'success');
    });
    // Полосы атрибутов: экспорт
    $('#horae-rpg-bar-export').on('click', () => {
        const blob = new Blob([JSON.stringify(settings.rpgBarConfig, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = 'horae-rpg-bars.json'; a.click(); URL.revokeObjectURL(a.href);
    });
    // Полосы атрибутов: импорт
    $('#horae-rpg-bar-import').on('click', () => document.getElementById('horae-rpg-bar-import-file')?.click());
    $('#horae-rpg-bar-import-file').on('change', function() {
        const file = this.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const arr = JSON.parse(reader.result);
                if (!Array.isArray(arr) || !arr.every(b => b.key && b.name)) throw new Error('Неверный формат');
                settings.rpgBarConfig = arr;
                saveSettings(); renderBarConfig();
                horaeManager.init(getContext(), settings); _refreshSystemPromptDisplay(); updateTokenCounter();
                showToast(`Импортировано ${arr.length} конфигураций полос атрибутов`, 'success');
            } catch (e) { showToast('Ошибка импорта: ' + e.message, 'error'); }
        };
        reader.readAsText(file);
        this.value = '';
    });
    // Панель атрибутов: сброс по умолчанию
    $('#horae-rpg-attr-reset').on('click', () => {
        if (!confirm('Сбросить панель атрибутов до конфигурации по умолчанию (шесть параметров DnD)?')) return;
        settings.rpgAttributeConfig = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.rpgAttributeConfig));
        saveSettings(); renderAttrConfig();
        horaeManager.init(getContext(), settings); _refreshSystemPromptDisplay(); updateTokenCounter();
        showToast('Панель атрибутов сброшена до значений по умолчанию', 'success');
    });
    // Панель атрибутов: экспорт
    $('#horae-rpg-attr-export').on('click', () => {
        const blob = new Blob([JSON.stringify(settings.rpgAttributeConfig, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = 'horae-rpg-attrs.json'; a.click(); URL.revokeObjectURL(a.href);
    });
    // Панель атрибутов: импорт
    $('#horae-rpg-attr-import').on('click', () => document.getElementById('horae-rpg-attr-import-file')?.click());
    $('#horae-rpg-attr-import-file').on('change', function() {
        const file = this.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const arr = JSON.parse(reader.result);
                if (!Array.isArray(arr) || !arr.every(a => a.key && a.name)) throw new Error('Неверный формат');
                settings.rpgAttributeConfig = arr;
                saveSettings(); renderAttrConfig();
                horaeManager.init(getContext(), settings); _refreshSystemPromptDisplay(); updateTokenCounter();
                showToast(`Импортировано ${arr.length} конфигураций атрибутов`, 'success');
            } catch (e) { showToast('Ошибка импорта: ' + e.message, 'error'); }
        };
        reader.readAsText(file);
        this.value = '';
    });

    $('#horae-rpg-add-bar').on('click', () => {
        if (!settings.rpgBarConfig) settings.rpgBarConfig = [];
        const existing = new Set(settings.rpgBarConfig.map(b => b.key));
        let newKey = 'bar1';
        for (let n = 1; existing.has(newKey); n++) newKey = `bar${n}`;
        settings.rpgBarConfig.push({ key: newKey, name: newKey.toUpperCase(), color: '#a78bfa' });
        saveSettings();
        renderBarConfig();
        horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay();
        updateTokenCounter();
    });

    // Кнопка редактирования атрибутов в карточке персонажа
    $(document).on('click', '.horae-rpg-charattr-edit', function() {
        const charName = this.dataset.char;
        if (!charName) return;
        const form = document.getElementById('horae-rpg-charattr-form');
        if (!form) return;
        form.style.display = '';
        const attrCfg = settings.rpgAttributeConfig || [];
        const attrInputs = attrCfg.map(a =>
            `<div class="horae-rpg-charattr-row"><label>${escapeHtml(a.name)}(${escapeHtml(a.key)})</label><input type="number" class="horae-rpg-charattr-val" data-key="${escapeHtml(a.key)}" min="0" max="100" placeholder="0-100" /></div>`
        ).join('');
        form.innerHTML = `
            <div class="horae-rpg-form-title">Редактирование: ${escapeHtml(charName)}</div>
            ${attrInputs}
            <div class="horae-rpg-form-actions">
                <button id="horae-rpg-charattr-save-inline" class="horae-rpg-btn-sm" data-char="${escapeHtml(charName)}">Сохранить</button>
                <button id="horae-rpg-charattr-cancel-inline" class="horae-rpg-btn-sm horae-rpg-btn-muted">Отмена</button>
            </div>`;
        // Заполнить существующими значениями
        const rpg = getContext().chat?.[0]?.horae_meta?.rpg;
        const existing = rpg?.attributes?.[charName] || {};
        form.querySelectorAll('.horae-rpg-charattr-val').forEach(inp => {
            const k = inp.dataset.key;
            if (existing[k] !== undefined) inp.value = existing[k];
        });
        form.querySelector('#horae-rpg-charattr-save-inline').addEventListener('click', function() {
            const name = this.dataset.char;
            const vals = {};
            let hasVal = false;
            form.querySelectorAll('.horae-rpg-charattr-val').forEach(inp => {
                const k = inp.dataset.key;
                const v = parseInt(inp.value);
                if (!isNaN(v)) { vals[k] = Math.max(0, Math.min(100, v)); hasVal = true; }
            });
            if (!hasVal) { showToast('Заполните хотя бы одно значение атрибута', 'warning'); return; }
            const chat = getContext().chat;
            if (!chat?.[0]?.horae_meta) return;
            if (!chat[0].horae_meta.rpg) chat[0].horae_meta.rpg = { bars: {}, status: {}, skills: {}, attributes: {} };
            if (!chat[0].horae_meta.rpg.attributes) chat[0].horae_meta.rpg.attributes = {};
            chat[0].horae_meta.rpg.attributes[name] = { ...(chat[0].horae_meta.rpg.attributes[name] || {}), ...vals };
            getContext().saveChat();
            form.style.display = 'none';
            updateRpgDisplay();
            showToast('Атрибуты персонажа сохранены', 'success');
        });
        form.querySelector('#horae-rpg-charattr-cancel-inline').addEventListener('click', () => {
            form.style.display = 'none';
        });
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // Ручное добавление/редактирование атрибутов персонажа RPG
    $('#horae-rpg-add-charattr').on('click', () => {
        const form = document.getElementById('horae-rpg-charattr-form');
        if (!form) return;
        if (form.style.display !== 'none') { form.style.display = 'none'; return; }
        const attrCfg = settings.rpgAttributeConfig || [];
        if (!attrCfg.length) { showToast('Сначала добавьте атрибуты в конфигурации панели атрибутов', 'warning'); return; }
        const attrInputs = attrCfg.map(a =>
            `<div class="horae-rpg-charattr-row"><label>${escapeHtml(a.name)}(${escapeHtml(a.key)})</label><input type="number" class="horae-rpg-charattr-val" data-key="${escapeHtml(a.key)}" min="0" max="100" placeholder="0-100" /></div>`
        ).join('');
        form.innerHTML = `
            <select id="horae-rpg-charattr-owner">${buildCharacterOptions()}</select>
            ${attrInputs}
            <div class="horae-rpg-form-actions">
                <button id="horae-rpg-charattr-load" class="horae-rpg-btn-sm horae-rpg-btn-muted">Загрузить существующие</button>
                <button id="horae-rpg-charattr-save" class="horae-rpg-btn-sm">Сохранить</button>
                <button id="horae-rpg-charattr-cancel" class="horae-rpg-btn-sm horae-rpg-btn-muted">Отмена</button>
            </div>`;
        form.style.display = '';
        // Загрузить существующие данные
        form.querySelector('#horae-rpg-charattr-load').addEventListener('click', () => {
            const ownerVal = form.querySelector('#horae-rpg-charattr-owner').value;
            const owner = ownerVal === '__user__' ? (getContext().name1 || '{{user}}') : ownerVal;
            const rpg = getContext().chat?.[0]?.horae_meta?.rpg;
            const existing = rpg?.attributes?.[owner] || {};
            form.querySelectorAll('.horae-rpg-charattr-val').forEach(inp => {
                const k = inp.dataset.key;
                if (existing[k] !== undefined) inp.value = existing[k];
            });
        });
        form.querySelector('#horae-rpg-charattr-save').addEventListener('click', () => {
            const ownerVal = form.querySelector('#horae-rpg-charattr-owner').value;
            const owner = ownerVal === '__user__' ? (getContext().name1 || '{{user}}') : ownerVal;
            const vals = {};
            let hasVal = false;
            form.querySelectorAll('.horae-rpg-charattr-val').forEach(inp => {
                const k = inp.dataset.key;
                const v = parseInt(inp.value);
                if (!isNaN(v)) { vals[k] = Math.max(0, Math.min(100, v)); hasVal = true; }
            });
            if (!hasVal) { showToast('Заполните хотя бы одно значение атрибута', 'warning'); return; }
            const chat = getContext().chat;
            if (!chat?.[0]?.horae_meta) return;
            if (!chat[0].horae_meta.rpg) chat[0].horae_meta.rpg = { bars: {}, status: {}, skills: {}, attributes: {} };
            if (!chat[0].horae_meta.rpg.attributes) chat[0].horae_meta.rpg.attributes = {};
            chat[0].horae_meta.rpg.attributes[owner] = { ...(chat[0].horae_meta.rpg.attributes[owner] || {}), ...vals };
            getContext().saveChat();
            form.style.display = 'none';
            updateRpgDisplay();
            showToast('Атрибуты персонажа сохранены', 'success');
        });
        form.querySelector('#horae-rpg-charattr-cancel').addEventListener('click', () => {
            form.style.display = 'none';
        });
    });

    // Добавление/удаление навыков RPG
    $('#horae-rpg-add-skill').on('click', () => {
        const form = document.getElementById('horae-rpg-skill-form');
        if (!form) return;
        if (form.style.display !== 'none') { form.style.display = 'none'; return; }
        form.innerHTML = `
            <select id="horae-rpg-skill-owner">${buildCharacterOptions()}</select>
            <input id="horae-rpg-skill-name" placeholder="Название навыка" maxlength="30" />
            <input id="horae-rpg-skill-level" placeholder="Уровень (необязательно)" maxlength="10" />
            <input id="horae-rpg-skill-desc" placeholder="Описание эффекта (необязательно)" maxlength="80" />
            <div class="horae-rpg-form-actions">
                <button id="horae-rpg-skill-save" class="horae-rpg-btn-sm">Подтвердить</button>
                <button id="horae-rpg-skill-cancel" class="horae-rpg-btn-sm horae-rpg-btn-muted">Отмена</button>
            </div>`;
        form.style.display = '';
        form.querySelector('#horae-rpg-skill-save').addEventListener('click', () => {
            const ownerVal = form.querySelector('#horae-rpg-skill-owner').value;
            const skillName = form.querySelector('#horae-rpg-skill-name').value.trim();
            if (!skillName) { showToast('Введите название навыка', 'warning'); return; }
            const owner = ownerVal === '__user__' ? (getContext().name1 || '{{user}}') : ownerVal;
            const chat = getContext().chat;
            if (!chat?.[0]?.horae_meta) return;
            if (!chat[0].horae_meta.rpg) chat[0].horae_meta.rpg = { bars: {}, status: {}, skills: {} };
            if (!chat[0].horae_meta.rpg.skills[owner]) chat[0].horae_meta.rpg.skills[owner] = [];
            chat[0].horae_meta.rpg.skills[owner].push({
                name: skillName,
                level: form.querySelector('#horae-rpg-skill-level').value.trim(),
                desc: form.querySelector('#horae-rpg-skill-desc').value.trim(),
                _userAdded: true,
            });
            getContext().saveChat();
            form.style.display = 'none';
            updateRpgDisplay();
            showToast('Навык добавлен', 'success');
        });
        form.querySelector('#horae-rpg-skill-cancel').addEventListener('click', () => {
            form.style.display = 'none';
        });
    });
    $(document).on('click', '.horae-rpg-skill-del', function() {
        const owner = this.dataset.owner;
        const skillName = this.dataset.skill;
        const chat = getContext().chat;
        const rpg = chat?.[0]?.horae_meta?.rpg;
        if (rpg?.skills?.[owner]) {
            rpg.skills[owner] = rpg.skills[owner].filter(s => s.name !== skillName);
            if (rpg.skills[owner].length === 0) delete rpg.skills[owner];
            if (!rpg._deletedSkills) rpg._deletedSkills = [];
            if (!rpg._deletedSkills.some(d => d.owner === owner && d.name === skillName)) {
                rpg._deletedSkills.push({ owner, name: skillName });
            }
            getContext().saveChat();
            updateRpgDisplay();
        }
    });

    // Конфигурация панели атрибутов
    $(document).on('input', '.horae-rpg-config-key[data-type="attr"]', function() {
        const i = parseInt(this.dataset.idx);
        if (settings.rpgAttributeConfig?.[i]) {
            const val = this.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
            if (val) settings.rpgAttributeConfig[i].key = val;
            saveSettings(); horaeManager.init(getContext(), settings); _refreshSystemPromptDisplay(); updateTokenCounter();
        }
    });
    $(document).on('input', '.horae-rpg-config-name[data-type="attr"]', function() {
        const i = parseInt(this.dataset.idx);
        if (settings.rpgAttributeConfig?.[i]) {
            settings.rpgAttributeConfig[i].name = this.value.trim() || settings.rpgAttributeConfig[i].key.toUpperCase();
            saveSettings(); horaeManager.init(getContext(), settings); _refreshSystemPromptDisplay(); updateTokenCounter();
        }
    });
    $(document).on('input', '.horae-rpg-attr-desc', function() {
        const i = parseInt(this.dataset.idx);
        if (settings.rpgAttributeConfig?.[i]) {
            settings.rpgAttributeConfig[i].desc = this.value.trim();
            saveSettings();
        }
    });
    $(document).on('click', '.horae-rpg-attr-del', function() {
        const i = parseInt(this.dataset.idx);
        if (settings.rpgAttributeConfig?.[i]) {
            settings.rpgAttributeConfig.splice(i, 1);
            saveSettings(); renderAttrConfig();
            horaeManager.init(getContext(), settings); _refreshSystemPromptDisplay(); updateTokenCounter();
        }
    });
    $('#horae-rpg-add-attr').on('click', () => {
        if (!settings.rpgAttributeConfig) settings.rpgAttributeConfig = [];
        const existing = new Set(settings.rpgAttributeConfig.map(a => a.key));
        let nk = 'attr1';
        for (let n = 1; existing.has(nk); n++) nk = `attr${n}`;
        settings.rpgAttributeConfig.push({ key: nk, name: nk.toUpperCase(), desc: '' });
        saveSettings(); renderAttrConfig();
        horaeManager.init(getContext(), settings); _refreshSystemPromptDisplay(); updateTokenCounter();
    });
    $('#horae-rpg-attr-view-toggle').on('click', () => {
        settings.rpgAttrViewMode = settings.rpgAttrViewMode === 'radar' ? 'text' : 'radar';
        saveSettings(); updateRpgDisplay();
    });
    // Переключатель панели атрибутов
    $('#horae-setting-rpg-attrs').on('change', function() {
        settings.sendRpgAttributes = this.checked;
        saveSettings();
        _syncRpgTabVisibility();
        horaeManager.init(getContext(), settings); _refreshSystemPromptDisplay(); updateTokenCounter();
        updateRpgDisplay();
    });
    // Пользовательский промпт RPG
    $('#horae-custom-rpg-prompt').on('input', function() {
        const val = this.value;
        settings.customRpgPrompt = (val.trim() === horaeManager.getDefaultRpgPrompt().trim()) ? '' : val;
        $('#horae-rpg-prompt-count').text(val.length);
        saveSettings(); horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay(); updateTokenCounter();
    });
    $('#horae-btn-reset-rpg-prompt').on('click', () => {
        if (!confirm('Сбросить промпт RPG до значения по умолчанию?')) return;
        settings.customRpgPrompt = '';
        saveSettings();
        const def = horaeManager.getDefaultRpgPrompt();
        $('#horae-custom-rpg-prompt').val(def);
        $('#horae-rpg-prompt-count').text(def.length);
        horaeManager.init(getContext(), settings); _refreshSystemPromptDisplay(); updateTokenCounter();
    });

    $('#horae-btn-agenda-select-all').on('click', selectAllAgenda);
    $('#horae-btn-agenda-delete').on('click', deleteSelectedAgenda);
    $('#horae-btn-agenda-cancel-select').on('click', exitAgendaMultiSelect);
    
    $('#horae-btn-timeline-multiselect').on('click', () => {
        if (timelineMultiSelectMode) {
            exitTimelineMultiSelect();
        } else {
            enterTimelineMultiSelect(null);
        }
    });
    $('#horae-btn-timeline-select-all').on('click', selectAllTimelineEvents);
    $('#horae-btn-timeline-compress').on('click', compressSelectedTimelineEvents);
    $('#horae-btn-timeline-delete').on('click', deleteSelectedTimelineEvents);
    $('#horae-btn-timeline-cancel-select').on('click', exitTimelineMultiSelect);
    
    $('#horae-items-search').on('input', updateItemsDisplay);
    $('#horae-items-filter').on('change', updateItemsDisplay);
    $('#horae-items-holder-filter').on('change', updateItemsDisplay);
    
    $('#horae-btn-items-select-all').on('click', selectAllItems);
    $('#horae-btn-items-delete').on('click', deleteSelectedItems);
    $('#horae-btn-items-cancel-select').on('click', exitMultiSelectMode);
    
    $('#horae-btn-npc-multiselect').on('click', () => {
        npcMultiSelectMode ? exitNpcMultiSelect() : enterNpcMultiSelect();
    });
    $('#horae-btn-npc-select-all').on('click', () => {
        document.querySelectorAll('#horae-npc-list .horae-npc-item').forEach(el => {
            const name = el.dataset.npcName;
            if (name) selectedNpcs.add(name);
        });
        updateCharactersDisplay();
        _updateNpcSelectedCount();
    });
    $('#horae-btn-npc-delete').on('click', deleteSelectedNpcs);
    $('#horae-btn-npc-cancel-select').on('click', exitNpcMultiSelect);
    
    $('#horae-btn-items-refresh').on('click', () => {
        updateItemsDisplay();
        showToast('Список предметов обновлён', 'info');
    });
    
    $('#horae-setting-send-timeline').on('change', function() {
        settings.sendTimeline = this.checked;
        saveSettings();
        horaeManager.init(getContext(), settings);
        updateTokenCounter();
    });
    
    $('#horae-setting-send-characters').on('change', function() {
        settings.sendCharacters = this.checked;
        saveSettings();
        horaeManager.init(getContext(), settings);
        updateTokenCounter();
    });
    
    $('#horae-setting-send-items').on('change', function() {
        settings.sendItems = this.checked;
        saveSettings();
        horaeManager.init(getContext(), settings);
        updateTokenCounter();
    });
    
    $('#horae-setting-send-location-memory').on('change', function() {
        settings.sendLocationMemory = this.checked;
        saveSettings();
        $('#horae-location-prompt-group').toggle(this.checked);
        $('.horae-tab[data-tab="locations"]').toggle(this.checked);
        horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay();
        updateTokenCounter();
    });
    
    $('#horae-setting-send-relationships').on('change', function() {
        settings.sendRelationships = this.checked;
        saveSettings();
        $('#horae-relationship-section').toggle(this.checked);
        $('#horae-relationship-prompt-group').toggle(this.checked);
        horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay();
        updateTokenCounter();
        if (this.checked) updateRelationshipDisplay();
    });
    
    $('#horae-setting-send-mood').on('change', function() {
        settings.sendMood = this.checked;
        saveSettings();
        $('#horae-mood-prompt-group').toggle(this.checked);
        horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay();
        updateTokenCounter();
    });

    $('#horae-setting-anti-paraphrase').on('change', function() {
        settings.antiParaphraseMode = this.checked;
        saveSettings();
        horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay();
        updateTokenCounter();
    });

    $('#horae-setting-sideplay-mode').on('change', function() {
        settings.sideplayMode = this.checked;
        saveSettings();
        document.querySelectorAll('.horae-message-panel').forEach(p => {
            const btn = p.querySelector('.horae-btn-sideplay');
            if (btn) btn.style.display = settings.sideplayMode ? '' : 'none';
        });
    });

    // RPG-режим
    $('#horae-setting-rpg-mode').on('change', function() {
        settings.rpgMode = this.checked;
        saveSettings();
        $('#horae-rpg-sub-options').toggle(this.checked);
        $('#horae-rpg-prompt-group').toggle(this.checked);
        _syncRpgTabVisibility();
        horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay();
        updateTokenCounter();
        if (this.checked) updateRpgDisplay();
    });
    $('#horae-setting-rpg-bars').on('change', function() {
        settings.sendRpgBars = this.checked;
        saveSettings();
        _syncRpgTabVisibility();
        horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay();
        updateTokenCounter();
        updateRpgDisplay();
    });
    $('#horae-setting-rpg-skills').on('change', function() {
        settings.sendRpgSkills = this.checked;
        saveSettings();
        _syncRpgTabVisibility();
        horaeManager.init(getContext(), settings);
        _refreshSystemPromptDisplay();
        updateTokenCounter();
        updateRpgDisplay();
    });
    $('#horae-setting-rpg-dice').on('change', function() {
        settings.rpgDiceEnabled = this.checked;
        saveSettings();
        renderDicePanel();
    });
    $('#horae-dice-reset-pos').on('click', () => {
        settings.dicePosX = null;
        settings.dicePosY = null;
        saveSettings();
        renderDicePanel();
        showToast('Положение панели кубиков сброшено', 'success');
    });

    // Авто-сводка: свёртывание панели
    $('#horae-autosummary-collapse-toggle').on('click', function() {
        const body = $('#horae-autosummary-collapse-body');
        const icon = $(this).find('.horae-collapse-icon');
        body.slideToggle(200);
        icon.toggleClass('collapsed');
    });

    // Авто-сводка: настройки
    $('#horae-setting-auto-summary').on('change', function() {
        settings.autoSummaryEnabled = this.checked;
        saveSettings();
        $('#horae-auto-summary-options').toggle(this.checked);
    });
    $('#horae-setting-auto-summary-keep').on('change', function() {
        settings.autoSummaryKeepRecent = Math.max(3, parseInt(this.value) || 10);
        this.value = settings.autoSummaryKeepRecent;
        saveSettings();
    });
    $('#horae-setting-auto-summary-mode').on('change', function() {
        settings.autoSummaryBufferMode = this.value;
        saveSettings();
        updateAutoSummaryHint();
    });
    $('#horae-setting-auto-summary-limit').on('change', function() {
        settings.autoSummaryBufferLimit = Math.max(5, parseInt(this.value) || 20);
        this.value = settings.autoSummaryBufferLimit;
        saveSettings();
    });
    $('#horae-setting-auto-summary-batch-msgs').on('change', function() {
        settings.autoSummaryBatchMaxMsgs = Math.max(5, parseInt(this.value) || 50);
        this.value = settings.autoSummaryBatchMaxMsgs;
        saveSettings();
    });
    $('#horae-setting-auto-summary-batch-tokens').on('change', function() {
        settings.autoSummaryBatchMaxTokens = Math.max(10000, parseInt(this.value) || 80000);
        this.value = settings.autoSummaryBatchMaxTokens;
        saveSettings();
    });
    $('#horae-setting-auto-summary-custom-api').on('change', function() {
        settings.autoSummaryUseCustomApi = this.checked;
        saveSettings();
        $('#horae-auto-summary-api-options').toggle(this.checked);
    });
    $('#horae-setting-auto-summary-api-url').on('input change', function() {
        settings.autoSummaryApiUrl = this.value;
        saveSettings();
    });
    $('#horae-setting-auto-summary-api-key').on('input change', function() {
        settings.autoSummaryApiKey = this.value;
        saveSettings();
    });
    $('#horae-setting-auto-summary-model').on('input change', function() {
        settings.autoSummaryModel = this.value;
        saveSettings();
    });

    $('#horae-btn-test-sub-api').on('click', testSubApiConnection);
    
    $('#horae-setting-panel-width').on('change', function() {
        let val = parseInt(this.value) || 100;
        val = Math.max(50, Math.min(100, val));
        this.value = val;
        settings.panelWidth = val;
        saveSettings();
        applyPanelWidth();
    });
    $('#horae-setting-panel-offset').on('input', function() {
        const val = Math.max(0, parseInt(this.value) || 0);
        settings.panelOffset = val;
        $('#horae-panel-offset-value').text(`${val}px`);
        saveSettings();
        applyPanelWidth();
    });

    // Переключение режима темы
    $('#horae-setting-theme-mode').on('change', function() {
        settings.themeMode = this.value;
        saveSettings();
        applyThemeMode();
    });

    // Импорт/экспорт/удаление темы / инструмент настройки темы
    $('#horae-btn-theme-export').on('click', exportTheme);
    $('#horae-btn-theme-import').on('click', importTheme);
    $('#horae-btn-theme-designer').on('click', openThemeDesigner);
    $('#horae-btn-theme-delete').on('click', function() {
        const mode = settings.themeMode || 'dark';
        if (!mode.startsWith('custom-')) {
            showToast('Можно удалить только импортированные пользовательские темы', 'warning');
            return;
        }
        deleteCustomTheme(parseInt(mode.split('-')[1]));
    });

    // Пользовательский CSS
    $('#horae-custom-css').on('change', function() {
        settings.customCSS = this.value;
        saveSettings();
        applyCustomCSS();
    });
    
    $('#horae-btn-refresh').on('click', refreshAllDisplays);
    
    $('#horae-btn-add-table-local').on('click', () => addNewExcelTable('local'));
    $('#horae-btn-add-table-global').on('click', () => addNewExcelTable('global'));
    $('#horae-btn-import-table').on('click', () => {
        $('#horae-import-table-file').trigger('click');
    });
    $('#horae-import-table-file').on('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            importTable(file);
            e.target.value = ''; // Сбросить для возможности повторного выбора того же файла
        }
    });
    renderCustomTablesList();
    
    $('#horae-btn-export').on('click', exportData);
    $('#horae-btn-import').on('click', importData);
    $('#horae-btn-clear').on('click', clearAllData);
    
    // Показать/скрыть расположение (нельзя использовать класс hidden, в SillyTavern глобально есть правило display:none)
    $('#horae-affection-toggle').on('click', function() {
        const list = $('#horae-affection-list');
        const icon = $(this).find('i');
        if (list.is(':visible')) {
            list.hide();
            icon.removeClass('fa-eye').addClass('fa-eye-slash');
            $(this).addClass('horae-eye-off');
        } else {
            list.show();
            icon.removeClass('fa-eye-slash').addClass('fa-eye');
            $(this).removeClass('horae-eye-off');
        }
    });
    
    // Пользовательские промпты
    $('#horae-custom-system-prompt').on('input', function() {
        const val = this.value;
        // Если совпадает с по умолчанию, считается ненастроенным
        settings.customSystemPrompt = (val.trim() === horaeManager.getDefaultSystemPrompt().trim()) ? '' : val;
        $('#horae-system-prompt-count').text(val.length);
        saveSettings();
        horaeManager.init(getContext(), settings);
        updateTokenCounter();
    });
    
    $('#horae-custom-batch-prompt').on('input', function() {
        const val = this.value;
        settings.customBatchPrompt = (val.trim() === getDefaultBatchPrompt().trim()) ? '' : val;
        $('#horae-batch-prompt-count').text(val.length);
        saveSettings();
    });
    
    $('#horae-btn-reset-system-prompt').on('click', () => {
        if (!confirm('Сбросить системный промпт до значения по умолчанию?')) return;
        settings.customSystemPrompt = '';
        saveSettings();
        const def = horaeManager.getDefaultSystemPrompt();
        $('#horae-custom-system-prompt').val(def);
        $('#horae-system-prompt-count').text(def.length);
        horaeManager.init(getContext(), settings);
        updateTokenCounter();
        showToast('Промпт сброшен до значения по умолчанию', 'success');
    });
    
    $('#horae-btn-reset-batch-prompt').on('click', () => {
        if (!confirm('Сбросить промпт ИИ-сводки до значения по умолчанию?')) return;
        settings.customBatchPrompt = '';
        saveSettings();
        const def = getDefaultBatchPrompt();
        $('#horae-custom-batch-prompt').val(def);
        $('#horae-batch-prompt-count').text(def.length);
        showToast('Промпт сброшен до значения по умолчанию', 'success');
    });

    // Промпт для ИИ-анализа
    $('#horae-custom-analysis-prompt').on('input', function() {
        const val = this.value;
        settings.customAnalysisPrompt = (val.trim() === getDefaultAnalysisPrompt().trim()) ? '' : val;
        $('#horae-analysis-prompt-count').text(val.length);
        saveSettings();
    });

    $('#horae-btn-reset-analysis-prompt').on('click', () => {
        if (!confirm('Сбросить промпт ИИ-анализа до значения по умолчанию?')) return;
        settings.customAnalysisPrompt = '';
        saveSettings();
        const def = getDefaultAnalysisPrompt();
        $('#horae-custom-analysis-prompt').val(def);
        $('#horae-analysis-prompt-count').text(def.length);
        showToast('Промпт сброшен до значения по умолчанию', 'success');
    });

    // Промпт для сжатия сюжета
    $('#horae-custom-compress-prompt').on('input', function() {
        const val = this.value;
        settings.customCompressPrompt = (val.trim() === getDefaultCompressPrompt().trim()) ? '' : val;
        $('#horae-compress-prompt-count').text(val.length);
        saveSettings();
    });

    $('#horae-btn-reset-compress-prompt').on('click', () => {
        if (!confirm('Сбросить промпт сжатия сюжета до значения по умолчанию?')) return;
        settings.customCompressPrompt = '';
        saveSettings();
        const def = getDefaultCompressPrompt();
        $('#horae-custom-compress-prompt').val(def);
        $('#horae-compress-prompt-count').text(def.length);
        showToast('Промпт сброшен до значения по умолчанию', 'success');
    });

    // Авто-сводка: промпт
    $('#horae-custom-auto-summary-prompt').on('input', function() {
        const val = this.value;
        settings.customAutoSummaryPrompt = (val.trim() === getDefaultAutoSummaryPrompt().trim()) ? '' : val;
        $('#horae-auto-summary-prompt-count').text(val.length);
        saveSettings();
    });

    $('#horae-btn-reset-auto-summary-prompt').on('click', () => {
        if (!confirm('Сбросить промпт авто-сводки до значения по умолчанию?')) return;
        settings.customAutoSummaryPrompt = '';
        saveSettings();
        const def = getDefaultAutoSummaryPrompt();
        $('#horae-custom-auto-summary-prompt').val(def);
        $('#horae-auto-summary-prompt-count').text(def.length);
        showToast('Промпт сброшен до значения по умолчанию', 'success');
    });

    // Промпт для правил заполнения таблиц
    $('#horae-custom-tables-prompt').on('input', function() {
        const val = this.value;
        settings.customTablesPrompt = (val.trim() === horaeManager.getDefaultTablesPrompt().trim()) ? '' : val;
        $('#horae-tables-prompt-count').text(val.length);
        saveSettings();
        horaeManager.init(getContext(), settings);
        updateTokenCounter();
    });

    $('#horae-btn-reset-tables-prompt').on('click', () => {
        if (!confirm('Сбросить промпт правил заполнения таблиц до значения по умолчанию?')) return;
        settings.customTablesPrompt = '';
        saveSettings();
        const def = horaeManager.getDefaultTablesPrompt();
        $('#horae-custom-tables-prompt').val(def);
        $('#horae-tables-prompt-count').text(def.length);
        horaeManager.init(getContext(), settings);
        updateTokenCounter();
        showToast('Промпт сброшен до значения по умолчанию', 'success');
    });

    // Память о локациях: промпт
    $('#horae-custom-location-prompt').on('input', function() {
        const val = this.value;
        settings.customLocationPrompt = (val.trim() === horaeManager.getDefaultLocationPrompt().trim()) ? '' : val;
        $('#horae-location-prompt-count').text(val.length);
        saveSettings();
        horaeManager.init(getContext(), settings);
        updateTokenCounter();
    });

    $('#horae-btn-reset-location-prompt').on('click', () => {
        if (!confirm('Сбросить промпт памяти о локациях до значения по умолчанию?')) return;
        settings.customLocationPrompt = '';
        saveSettings();
        const def = horaeManager.getDefaultLocationPrompt();
        $('#horae-custom-location-prompt').val(def);
        $('#horae-location-prompt-count').text(def.length);
        horaeManager.init(getContext(), settings);
        updateTokenCounter();
        showToast('Промпт сброшен до значения по умолчанию', 'success');
    });

    // Промпт для сети отношений
    $('#horae-custom-relationship-prompt').on('input', function() {
        const val = this.value;
        settings.customRelationshipPrompt = (val.trim() === horaeManager.getDefaultRelationshipPrompt().trim()) ? '' : val;
        $('#horae-relationship-prompt-count').text(val.length);
        saveSettings();
        horaeManager.init(getContext(), settings);
        updateTokenCounter();
    });

    $('#horae-btn-reset-relationship-prompt').on('click', () => {
        if (!confirm('Сбросить промпт сети отношений до значения по умолчанию?')) return;
        settings.customRelationshipPrompt = '';
        saveSettings();
        const def = horaeManager.getDefaultRelationshipPrompt();
        $('#horae-custom-relationship-prompt').val(def);
        $('#horae-relationship-prompt-count').text(def.length);
        horaeManager.init(getContext(), settings);
        updateTokenCounter();
        showToast('Промпт сброшен до значения по умолчанию', 'success');
    });

    // Отслеживание эмоций: промпт
    $('#horae-custom-mood-prompt').on('input', function() {
        const val = this.value;
        settings.customMoodPrompt = (val.trim() === horaeManager.getDefaultMoodPrompt().trim()) ? '' : val;
        $('#horae-mood-prompt-count').text(val.length);
        saveSettings();
        horaeManager.init(getContext(), settings);
        updateTokenCounter();
    });

    $('#horae-btn-reset-mood-prompt').on('click', () => {
        if (!confirm('Сбросить промпт отслеживания эмоций до значения по умолчанию?')) return;
        settings.customMoodPrompt = '';
        saveSettings();
        const def = horaeManager.getDefaultMoodPrompt();
        $('#horae-custom-mood-prompt').val(def);
        $('#horae-mood-prompt-count').text(def.length);
        horaeManager.init(getContext(), settings);
        updateTokenCounter();
        showToast('Промпт сброшен до значения по умолчанию', 'success');
    });

    // Переключение сворачивания области промптов
    $('#horae-prompt-collapse-toggle').on('click', function() {
        const body = $('#horae-prompt-collapse-body');
        const icon = $(this).find('.horae-collapse-icon');
        body.slideToggle(200);
        icon.toggleClass('collapsed');
    });

    // Пользовательский CSS: переключение свёртывания
    $('#horae-css-collapse-toggle').on('click', function() {
        const body = $('#horae-css-collapse-body');
        const icon = $(this).find('.horae-collapse-icon');
        body.slideToggle(200);
        icon.toggleClass('collapsed');
    });

    // Векторная память: переключение свёртывания
    $('#horae-vector-collapse-toggle').on('click', function() {
        const body = $('#horae-vector-collapse-body');
        const icon = $(this).find('.horae-collapse-icon');
        body.slideToggle(200);
        icon.toggleClass('collapsed');
    });

    $('#horae-setting-vector-enabled').on('change', function() {
        settings.vectorEnabled = this.checked;
        saveSettings();
        $('#horae-vector-options').toggle(this.checked);
        if (this.checked && !vectorManager.isReady) {
            _initVectorModel();
        } else if (!this.checked) {
            vectorManager.dispose();
            _updateVectorStatus();
        }
    });

    $('#horae-setting-vector-source').on('change', function() {
        settings.vectorSource = this.value;
        saveSettings();
        _syncVectorSourceUI();
        if (settings.vectorEnabled) {
            vectorManager.clearIndex().then(() => {
                showToast('Источник векторов изменён, индекс очищен, идёт загрузка...', 'info');
                _initVectorModel();
            });
        }
    });

    $('#horae-setting-vector-model').on('change', function() {
        settings.vectorModel = this.value;
        saveSettings();
        if (settings.vectorEnabled) {
            vectorManager.clearIndex().then(() => {
                showToast('Модель изменена, индекс очищен, идёт загрузка новой модели...', 'info');
                _initVectorModel();
            });
        }
    });

    $('#horae-setting-vector-dtype').on('change', function() {
        settings.vectorDtype = this.value;
        saveSettings();
        if (settings.vectorEnabled) {
            vectorManager.clearIndex().then(() => {
                showToast('Точность квантования изменена, индекс очищен, идёт перезагрузка...', 'info');
                _initVectorModel();
            });
        }
    });

    $('#horae-setting-vector-api-url').on('change', function() {
        settings.vectorApiUrl = this.value.trim();
        saveSettings();
    });

    $('#horae-setting-vector-api-key').on('change', function() {
        settings.vectorApiKey = this.value.trim();
        saveSettings();
    });

    $('#horae-setting-vector-api-model').on('change', function() {
        settings.vectorApiModel = this.value.trim();
        saveSettings();
        if (settings.vectorEnabled && settings.vectorSource === 'api') {
            vectorManager.clearIndex().then(() => {
                showToast('Модель API изменена, индекс очищен, идёт повторное подключение...', 'info');
                _initVectorModel();
            });
        }
    });

    $('#horae-setting-vector-pure-mode').on('change', function() {
        settings.vectorPureMode = this.checked;
        saveSettings();
    });

    $('#horae-setting-vector-rerank-enabled').on('change', function() {
        settings.vectorRerankEnabled = this.checked;
        saveSettings();
        $('#horae-vector-rerank-options').toggle(this.checked);
    });

    $('#horae-setting-vector-rerank-fulltext').on('change', function() {
        settings.vectorRerankFullText = this.checked;
        saveSettings();
    });

    $('#horae-setting-vector-rerank-model').on('change', function() {
        settings.vectorRerankModel = this.value.trim();
        saveSettings();
    });

    $('#horae-setting-vector-rerank-url').on('change', function() {
        settings.vectorRerankUrl = this.value.trim();
        saveSettings();
    });

    $('#horae-setting-vector-rerank-key').on('change', function() {
        settings.vectorRerankKey = this.value.trim();
        saveSettings();
    });

    $('#horae-setting-vector-topk').on('change', function() {
        settings.vectorTopK = parseInt(this.value) || 5;
        saveSettings();
    });

    $('#horae-setting-vector-threshold').on('change', function() {
        settings.vectorThreshold = parseFloat(this.value) || 0.72;
        saveSettings();
    });

    $('#horae-setting-vector-fulltext-count').on('change', function() {
        settings.vectorFullTextCount = parseInt(this.value) || 0;
        saveSettings();
    });

    $('#horae-setting-vector-fulltext-threshold').on('change', function() {
        settings.vectorFullTextThreshold = parseFloat(this.value) || 0.9;
        saveSettings();
    });

    $('#horae-btn-vector-build').on('click', _buildVectorIndex);
    $('#horae-btn-vector-clear').on('click', _clearVectorIndex);
}

/**
 * Синхронизировать настройки с UI
 */
function _refreshSystemPromptDisplay() {
    if (settings.customSystemPrompt) return;
    const def = horaeManager.getDefaultSystemPrompt();
    $('#horae-custom-system-prompt').val(def);
    $('#horae-system-prompt-count').text(def.length);
}

function _syncVectorSourceUI() {
    const isApi = settings.vectorSource === 'api';
    $('#horae-vector-local-options').toggle(!isApi);
    $('#horae-vector-api-options').toggle(isApi);
}

function syncSettingsToUI() {
    $('#horae-setting-enabled').prop('checked', settings.enabled);
    $('#horae-setting-auto-parse').prop('checked', settings.autoParse);
    $('#horae-setting-inject-context').prop('checked', settings.injectContext);
    $('#horae-setting-show-panel').prop('checked', settings.showMessagePanel);
    $('#horae-setting-show-top-icon').prop('checked', settings.showTopIcon !== false);
    $('#horae-ext-show-top-icon').prop('checked', settings.showTopIcon !== false);
    $('#horae-setting-context-depth').val(settings.contextDepth);
    $('#horae-setting-injection-position').val(settings.injectionPosition);
    $('#horae-setting-send-timeline').prop('checked', settings.sendTimeline);
    $('#horae-setting-send-characters').prop('checked', settings.sendCharacters);
    $('#horae-setting-send-items').prop('checked', settings.sendItems);
    
    applyTopIconVisibility();
    
    // Память о локациях
    $('#horae-setting-send-location-memory').prop('checked', !!settings.sendLocationMemory);
    $('#horae-location-prompt-group').toggle(!!settings.sendLocationMemory);
    $('.horae-tab[data-tab="locations"]').toggle(!!settings.sendLocationMemory);
    
    // Сеть отношений
    $('#horae-setting-send-relationships').prop('checked', !!settings.sendRelationships);
    $('#horae-relationship-section').toggle(!!settings.sendRelationships);
    $('#horae-relationship-prompt-group').toggle(!!settings.sendRelationships);
    
    // Отслеживание эмоций
    $('#horae-setting-send-mood').prop('checked', !!settings.sendMood);
    $('#horae-mood-prompt-group').toggle(!!settings.sendMood);
    
    // Режим без пересказа
    $('#horae-setting-anti-paraphrase').prop('checked', !!settings.antiParaphraseMode);
    // Режим побочной сцены
    $('#horae-setting-sideplay-mode').prop('checked', !!settings.sideplayMode);

    // RPG-режим
    $('#horae-setting-rpg-mode').prop('checked', !!settings.rpgMode);
    $('#horae-rpg-sub-options').toggle(!!settings.rpgMode);
    $('#horae-setting-rpg-bars').prop('checked', settings.sendRpgBars !== false);
    $('#horae-setting-rpg-attrs').prop('checked', settings.sendRpgAttributes !== false);
    $('#horae-setting-rpg-skills').prop('checked', settings.sendRpgSkills !== false);
    $('#horae-setting-rpg-dice').prop('checked', !!settings.rpgDiceEnabled);
    $('#horae-rpg-prompt-group').toggle(!!settings.rpgMode);
    _syncRpgTabVisibility();

    // Авто-сводка
    $('#horae-setting-auto-summary').prop('checked', !!settings.autoSummaryEnabled);
    $('#horae-auto-summary-options').toggle(!!settings.autoSummaryEnabled);
    $('#horae-setting-auto-summary-keep').val(settings.autoSummaryKeepRecent || 10);
    $('#horae-setting-auto-summary-mode').val(settings.autoSummaryBufferMode || 'messages');
    $('#horae-setting-auto-summary-limit').val(settings.autoSummaryBufferLimit || 20);
    $('#horae-setting-auto-summary-batch-msgs').val(settings.autoSummaryBatchMaxMsgs || 50);
    $('#horae-setting-auto-summary-batch-tokens').val(settings.autoSummaryBatchMaxTokens || 80000);
    $('#horae-setting-auto-summary-custom-api').prop('checked', !!settings.autoSummaryUseCustomApi);
    $('#horae-auto-summary-api-options').toggle(!!settings.autoSummaryUseCustomApi);
    $('#horae-setting-auto-summary-api-url').val(settings.autoSummaryApiUrl || '');
    $('#horae-setting-auto-summary-api-key').val(settings.autoSummaryApiKey || '');
    $('#horae-setting-auto-summary-model').val(settings.autoSummaryModel || '');
    updateAutoSummaryHint();

    const sysPrompt = settings.customSystemPrompt || horaeManager.getDefaultSystemPrompt();
    const batchPromptVal = settings.customBatchPrompt || getDefaultBatchPrompt();
    const analysisPromptVal = settings.customAnalysisPrompt || getDefaultAnalysisPrompt();
    const compressPromptVal = settings.customCompressPrompt || getDefaultCompressPrompt();
    const autoSumPromptVal = settings.customAutoSummaryPrompt || getDefaultAutoSummaryPrompt();
    const tablesPromptVal = settings.customTablesPrompt || horaeManager.getDefaultTablesPrompt();
    const locationPromptVal = settings.customLocationPrompt || horaeManager.getDefaultLocationPrompt();
    const relPromptVal = settings.customRelationshipPrompt || horaeManager.getDefaultRelationshipPrompt();
    const moodPromptVal = settings.customMoodPrompt || horaeManager.getDefaultMoodPrompt();
    const rpgPromptVal = settings.customRpgPrompt || horaeManager.getDefaultRpgPrompt();
    $('#horae-custom-system-prompt').val(sysPrompt);
    $('#horae-custom-batch-prompt').val(batchPromptVal);
    $('#horae-custom-analysis-prompt').val(analysisPromptVal);
    $('#horae-custom-compress-prompt').val(compressPromptVal);
    $('#horae-custom-auto-summary-prompt').val(autoSumPromptVal);
    $('#horae-custom-tables-prompt').val(tablesPromptVal);
    $('#horae-custom-location-prompt').val(locationPromptVal);
    $('#horae-custom-relationship-prompt').val(relPromptVal);
    $('#horae-custom-mood-prompt').val(moodPromptVal);
    $('#horae-custom-rpg-prompt').val(rpgPromptVal);
    $('#horae-system-prompt-count').text(sysPrompt.length);
    $('#horae-batch-prompt-count').text(batchPromptVal.length);
    $('#horae-analysis-prompt-count').text(analysisPromptVal.length);
    $('#horae-compress-prompt-count').text(compressPromptVal.length);
    $('#horae-auto-summary-prompt-count').text(autoSumPromptVal.length);
    $('#horae-tables-prompt-count').text(tablesPromptVal.length);
    $('#horae-location-prompt-count').text(locationPromptVal.length);
    $('#horae-relationship-prompt-count').text(relPromptVal.length);
    $('#horae-mood-prompt-count').text(moodPromptVal.length);
    $('#horae-rpg-prompt-count').text(rpgPromptVal.length);
    
    // Ширина и смещение панели
    $('#horae-setting-panel-width').val(settings.panelWidth || 100);
    const ofs = settings.panelOffset || 0;
    $('#horae-setting-panel-offset').val(ofs);
    $('#horae-panel-offset-value').text(`${ofs}px`);
    applyPanelWidth();

    // Режим темы
    refreshThemeSelector();
    applyThemeMode();

    // Пользовательский CSS
    $('#horae-custom-css').val(settings.customCSS || '');
    applyCustomCSS();

    // Векторная память
    $('#horae-setting-vector-enabled').prop('checked', !!settings.vectorEnabled);
    $('#horae-vector-options').toggle(!!settings.vectorEnabled);
    $('#horae-setting-vector-source').val(settings.vectorSource || 'local');
    $('#horae-setting-vector-model').val(settings.vectorModel || 'Xenova/bge-small-zh-v1.5');
    $('#horae-setting-vector-dtype').val(settings.vectorDtype || 'q8');
    $('#horae-setting-vector-api-url').val(settings.vectorApiUrl || '');
    $('#horae-setting-vector-api-key').val(settings.vectorApiKey || '');
    $('#horae-setting-vector-api-model').val(settings.vectorApiModel || '');
    $('#horae-setting-vector-pure-mode').prop('checked', !!settings.vectorPureMode);
    $('#horae-setting-vector-rerank-enabled').prop('checked', !!settings.vectorRerankEnabled);
    $('#horae-vector-rerank-options').toggle(!!settings.vectorRerankEnabled);
    $('#horae-setting-vector-rerank-fulltext').prop('checked', !!settings.vectorRerankFullText);
    $('#horae-setting-vector-rerank-model').val(settings.vectorRerankModel || '');
    $('#horae-setting-vector-rerank-url').val(settings.vectorRerankUrl || '');
    $('#horae-setting-vector-rerank-key').val(settings.vectorRerankKey || '');
    $('#horae-setting-vector-topk').val(settings.vectorTopK || 5);
    $('#horae-setting-vector-threshold').val(settings.vectorThreshold || 0.72);
    $('#horae-setting-vector-fulltext-count').val(settings.vectorFullTextCount ?? 3);
    $('#horae-setting-vector-fulltext-threshold').val(settings.vectorFullTextThreshold ?? 0.9);
    _syncVectorSourceUI();
    _updateVectorStatus();
}

// ============================================
// Векторная память
// ============================================

function _deriveChatId(ctx) {
    if (ctx?.chatId) return ctx.chatId;
    const chat = ctx?.chat;
    if (chat?.length > 0 && chat[0].create_date) return `chat_${chat[0].create_date}`;
    return 'unknown';
}

function _updateVectorStatus() {
    const statusEl = document.getElementById('horae-vector-status-text');
    const countEl = document.getElementById('horae-vector-index-count');
    if (!statusEl) return;
    if (vectorManager.isLoading) {
        statusEl.textContent = 'Загрузка модели...';
    } else if (vectorManager.isReady) {
        const dimText = vectorManager.dimensions ? ` (${vectorManager.dimensions}D)` : '';
        const nameText = vectorManager.isApiMode
            ? `API: ${vectorManager.modelName}`
            : vectorManager.modelName.split('/').pop();
        statusEl.textContent = `✓ ${nameText}${dimText}`;
    } else {
        statusEl.textContent = settings.vectorEnabled ? 'Модель не загружена' : 'Отключено';
    }
    if (countEl) {
        countEl.textContent = vectorManager.vectors.size > 0
            ? `| Индекс: ${vectorManager.vectors.size} записей`
            : '';
    }
}

/** Определить, является ли устройство мобильным (iOS/Android/маленький экран) */
function _isMobileDevice() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
    return window.innerWidth <= 768 && ('ontouchstart' in window);
}

/**
 * Проверка безопасности локальных векторов на мобильном устройстве: загрузка только после подтверждения в окне, чтобы предотвратить OOM-краш.
 * Возвращает true = разрешить загрузку, false = пользователь отказался или заблокировано
 */
function _mobileLocalVectorGuard() {
    if (!_isMobileDevice()) return Promise.resolve(true);
    if (settings.vectorSource === 'api') return Promise.resolve(true);

    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'horae-modal';
        modal.innerHTML = `
        <div class="horae-modal-content" style="max-width:360px;">
            <div class="horae-modal-header"><i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;"></i> Предупреждение о локальной векторной модели</div>
            <div class="horae-modal-body" style="font-size:13px;line-height:1.6;">
                <p>Обнаружено использование <b>локальной векторной модели</b> на <b>мобильном устройстве</b>.</p>
                <p>Локальная модель требует загрузки ~30–60 МБ WASM-модели в браузер, что <b>может легко вызвать переполнение памяти и аварийный выход</b>.</p>
                <p style="color:var(--horae-accent,#6366f1);font-weight:600;">Настоятельно рекомендуется переключиться на «Режим API» (например, бесплатные векторные модели SiliconFlow) — нулевая нагрузка на память.</p>
            </div>
            <div class="horae-modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:10px 16px;">
                <button id="horae-vec-guard-cancel" class="horae-btn" style="flex:1;">Не загружать</button>
                <button id="horae-vec-guard-ok" class="horae-btn" style="flex:1;opacity:0.7;">Всё равно загрузить</button>
            </div>
        </div>`;
        document.body.appendChild(modal);

        modal.querySelector('#horae-vec-guard-cancel').addEventListener('click', () => {
            modal.remove();
            resolve(false);
        });
        modal.querySelector('#horae-vec-guard-ok').addEventListener('click', () => {
            modal.remove();
            resolve(true);
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) { modal.remove(); resolve(false); }
        });
    });
}

async function _initVectorModel() {
    if (vectorManager.isLoading) return;

    // Мобильное устройство + локальная модель: подтверждение в окне, по умолчанию не загружать
    const allowed = await _mobileLocalVectorGuard();
    if (!allowed) {
        showToast('Загрузка локальной векторной модели пропущена. Рекомендуется переключиться на режим API', 'info');
        return;
    }

    const progressEl = document.getElementById('horae-vector-progress');
    const fillEl = document.getElementById('horae-vector-progress-fill');
    const textEl = document.getElementById('horae-vector-progress-text');
    if (progressEl) progressEl.style.display = 'block';

    try {
        if (settings.vectorSource === 'api') {
            const apiUrl = settings.vectorApiUrl;
            const apiKey = settings.vectorApiKey;
            const apiModel = settings.vectorApiModel;
            if (!apiUrl || !apiKey || !apiModel) {
                throw new Error('Заполните адрес API, ключ и название модели полностью');
            }
            await vectorManager.initApi(apiUrl, apiKey, apiModel);
        } else {
            await vectorManager.initModel(
                settings.vectorModel || 'Xenova/bge-small-zh-v1.5',
                settings.vectorDtype || 'q8',
                (info) => {
                    if (info.status === 'progress' && fillEl && textEl) {
                        const pct = info.progress?.toFixed(0) || 0;
                        fillEl.style.width = `${pct}%`;
                        textEl.textContent = `Загрузка модели... ${pct}%`;
                    } else if (info.status === 'done' && textEl) {
                        textEl.textContent = 'Загрузка модели...';
                    }
                    _updateVectorStatus();
                }
            );
        }

        const ctx = getContext();
        const chatId = _deriveChatId(ctx);
        await vectorManager.loadChat(chatId, horaeManager.getChat());

        const displayName = settings.vectorSource === 'api'
            ? `API: ${settings.vectorApiModel}`
            : vectorManager.modelName.split('/').pop();
        showToast(`Векторная модель загружена: ${displayName}`, 'success');
    } catch (err) {
        console.error('[Horae] Ошибка загрузки векторной модели:', err);
        showToast(`Ошибка загрузки векторной модели: ${err.message}`, 'error');
    } finally {
        if (progressEl) progressEl.style.display = 'none';
        _updateVectorStatus();
    }
}

async function _buildVectorIndex() {
    if (!vectorManager.isReady) {
        showToast('Дождитесь завершения загрузки модели', 'warning');
        return;
    }

    const chat = horaeManager.getChat();
    if (!chat || chat.length === 0) {
        showToast('Нет истории чата', 'warning');
        return;
    }

    const progressEl = document.getElementById('horae-vector-progress');
    const fillEl = document.getElementById('horae-vector-progress-fill');
    const textEl = document.getElementById('horae-vector-progress-text');
    if (progressEl) progressEl.style.display = 'block';
    if (textEl) textEl.textContent = 'Построение индекса...';

    try {
        const result = await vectorManager.batchIndex(chat, ({ current, total }) => {
            const pct = Math.round((current / total) * 100);
            if (fillEl) fillEl.style.width = `${pct}%`;
            if (textEl) textEl.textContent = `Построение индекса: ${current}/${total}`;
        });

        showToast(`Индекс построен: ${result.indexed} добавлено, ${result.skipped} пропущено`, 'success');
    } catch (err) {
        console.error('[Horae] Ошибка построения индекса:', err);
        showToast(`Ошибка построения индекса: ${err.message}`, 'error');
    } finally {
        if (progressEl) progressEl.style.display = 'none';
        _updateVectorStatus();
    }
}

async function _clearVectorIndex() {
    if (!confirm('Очистить все векторные индексы текущего диалога?')) return;
    await vectorManager.clearIndex();
    showToast('Векторный индекс очищен', 'success');
    _updateVectorStatus();
}

// ============================================
// Основные функции
// ============================================

/**
 * Сканирование истории с индикатором прогресса
 */
async function scanHistoryWithProgress() {
    const overlay = document.createElement('div');
    overlay.className = 'horae-progress-overlay' + (isLightMode() ? ' horae-light' : '');
    overlay.innerHTML = `
        <div class="horae-progress-container">
            <div class="horae-progress-title">Сканирование истории...</div>
            <div class="horae-progress-bar">
                <div class="horae-progress-fill" style="width: 0%"></div>
            </div>
            <div class="horae-progress-text">Подготовка...</div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    const fillEl = overlay.querySelector('.horae-progress-fill');
    const textEl = overlay.querySelector('.horae-progress-text');
    
    try {
        const result = await horaeManager.scanAndInjectHistory(
            (percent, current, total) => {
                fillEl.style.width = `${percent}%`;
                textEl.textContent = `Обработка... ${current}/${total}`;
            },
            null // Не использовать ИИ-анализ, только разбирать имеющиеся теги
        );
        
        horaeManager.rebuildTableData();
        
        await getContext().saveChat();
        
        showToast(`Сканирование завершено! Обработано: ${result.processed}, пропущено: ${result.skipped}`, 'success');
        refreshAllDisplays();
        renderCustomTablesList();
    } catch (error) {
        console.error('[Horae] Ошибка сканирования:', error);
        showToast('Ошибка сканирования: ' + error.message, 'error');
    } finally {
        overlay.remove();
    }
}

/** Шаблон промпта для пакетного суммирования по умолчанию */
function getDefaultBatchPrompt() {
    return `Ты — помощник по анализу сюжета. Проанализируй каждое сообщение в диалоге и извлеки [Время], [Событие сюжета] и [Изменение предметов].

Основные принципы:
- Извлекай только явно указанную информацию, не выдумывай
- Анализируй каждое сообщение отдельно, разделяй через ===Сообщение#номер===

{{messages}}

[Формат вывода] Для каждого сообщения:

===Сообщение#номер===
<horae>
time:дата время (из текста, напр. 2026/2/4 15:00 или Третий день месяца Заморозков, сумерки)
item:emoji название_предмета(кол-во)|описание=владелец@местоположение (новые предметы, описание необязательно для обычных)
item!:emoji название_предмета(кол-во)|описание=владелец@местоположение (важный предмет, описание обязательно)
item-:название_предмета (израсходованные/утерянные предметы)
</horae>
<horaeevent>
event:уровень|краткое описание события (30-50 символов, уровень: обычное/важное/ключевое — но значения тегов: 一般/重要/关键)
</horaeevent>

[Правила]
· time: извлеки дату и время текущей сцены, обязательно (если нет явного времени — используй контекст)
· event: ключевые события в данном сообщении, минимум одно event на сообщение
· Предметы записывай только при получении, расходе или смене состояния; если нет изменений — пропускай строку item
· Формат item: emoji-префикс напр. 🔑🍞, для одной единицы не пиши (1), местоположение точное (❌ на полу ✅ на столе в зале таверны)
· Уровень важности: повседневный диалог=一般 (обычное), движение сюжета=重要 (важное), ключевой поворот=关键 (ключевое)
· {{user}} — имя главного героя`;
}

/** Шаблон промпта ИИ-анализа по умолчанию */
function getDefaultAnalysisPrompt() {
    return `Проанализируй следующий текст, извлеки ключевую информацию и выведи в указанном формате. Основные принципы: извлекай только явно упомянутую информацию, не заполняй отсутствующие поля, не выдумывай.

[Текст]
{{content}}

[Формат вывода]
<horae>
time:дата время (обязательно, напр. 2026/2/4 15:00 или Первый день месяца Заморозков 19:50)
location:текущее место (обязательно)
atmosphere:атмосфера
characters:присутствующие персонажи, через запятую (обязательно)
costume:имя_персонажа=полное описание одежды (обязательно, отдельная строка для каждого, не объединять через точку с запятой)
item:emoji название_предмета(кол-во)|описание=владелец@точное_местоположение (только новые или изменившиеся предметы)
item!:emoji название_предмета(кол-во)|описание=владелец@точное_местоположение (важный предмет, описание обязательно)
item!!:emoji название_предмета(кол-во)|описание=владелец@точное_местоположение (ключевой предмет, подробное описание обязательно)
item-:название_предмета (израсходованные/утерянные предметы)
affection:имя_персонажа=значение_расположения (только расположение NPC к {{user}}, не записывать самого {{user}}, без примечаний после числа)
npc:имя_персонажа|внешность=характер@отношения_с_{{user}}~性别:мужской_или_женский~年龄:число~种族:название_расы~职业:название_профессии
agenda:дата|содержание_задачи (только новые договорённости/планы/крючки, для относительного времени указывай абсолютную дату в скобках)
agenda-:ключевые_слова (когда задача выполнена/устарела/отменена; система автоматически удалит совпадающие задачи)
</horae>
<horaeevent>
event:уровень|краткое описание события (30-50 символов, 一般/重要/关键)
</horaeevent>

[Условия] Выводи поле только при выполнении условия:
· Предметы: только при новом получении, смене количества/владельца/местоположения, расходе/потере. Без изменений — не писать. Для одной единицы (1) не указывать. Emoji-префикс напр. 🔑🍞.
· NPC: при первом появлении — полная запись (включая ~пол/возраст/раса/профессия). Затем писать только изменившиеся поля.
  Разделители: | для имени, = для внешности и характера, @ для отношений, ~ для доп. полей
· Расположение: первый раз определяется по отношениям (незнакомец 0-20/знакомый 30-50/друг 50-70), затем писать только при изменении.
· Задачи: только при новых договорённостях/планах/крючках. Выполненные/устаревшие удаляй через agenda-.
  Добавить: agenda:2026/02/10|Элен пригласила {{user}} на свидание в День святого Валентина(2026/02/14 18:00)
  Удалить: agenda-:Элен пригласила {{user}} на свидание в День святого Валентина
· event: помещай в <horaeevent>, не в <horae>.`;
}

let _autoSummaryRanThisTurn = false;

/**
 * Точка запуска авто-сводки
 * useProfile=true: разрешить смену профиля соединения (только в последовательном режиме после ответа ИИ)
 * useProfile=false: напрямую вызвать generateRaw (безопасно для параллелизма)
 */
async function generateForSummary(prompt) {
    // Перечитать настройки дополнительного API из DOM, чтобы автозаполнение браузера не привело к пустым значениям
    _syncSubApiSettingsFromDom();
    const useCustom = settings.autoSummaryUseCustomApi;
    const hasUrl = !!(settings.autoSummaryApiUrl && settings.autoSummaryApiUrl.trim());
    const hasKey = !!(settings.autoSummaryApiKey && settings.autoSummaryApiKey.trim());
    const hasModel = !!(settings.autoSummaryModel && settings.autoSummaryModel.trim());
    console.log(`[Horae] generateForSummary: useCustom=${useCustom}, hasUrl=${hasUrl}, hasKey=${hasKey}, hasModel=${hasModel}`);
    if (useCustom && hasUrl && hasKey && hasModel) {
        return await generateWithDirectApi(prompt);
    }
    if (useCustom && (!hasUrl || !hasKey || !hasModel)) {
        const missing = [!hasUrl && 'Адрес API', !hasKey && 'Ключ API', !hasModel && 'Название модели'].filter(Boolean).join(', ');
        console.warn(`[Horae] Дополнительный API включён, но отсутствует: ${missing}, используется основной API`);
        showToast(`Дополнительный API: не указано ${missing}, используется основной`, 'warning');
    } else if (!useCustom) {
        console.log('[Horae] Дополнительный API не активен, используется основной API (generateRaw)');
    }
    return await getContext().generateRaw(prompt, null, false, false);
}

function _syncSubApiSettingsFromDom() {
    try {
        const urlEl = document.getElementById('horae-setting-auto-summary-api-url');
        const keyEl = document.getElementById('horae-setting-auto-summary-api-key');
        const modelEl = document.getElementById('horae-setting-auto-summary-model');
        const checkEl = document.getElementById('horae-setting-auto-summary-custom-api');
        let changed = false;
        if (checkEl && checkEl.checked !== settings.autoSummaryUseCustomApi) {
            settings.autoSummaryUseCustomApi = checkEl.checked;
            changed = true;
        }
        if (urlEl && urlEl.value && urlEl.value !== settings.autoSummaryApiUrl) {
            settings.autoSummaryApiUrl = urlEl.value;
            changed = true;
        }
        if (keyEl && keyEl.value && keyEl.value !== settings.autoSummaryApiKey) {
            settings.autoSummaryApiKey = keyEl.value;
            changed = true;
        }
        if (modelEl && modelEl.value && modelEl.value !== settings.autoSummaryModel) {
            settings.autoSummaryModel = modelEl.value;
            changed = true;
        }
        if (changed) saveSettings();
    } catch (_) {}
}

/** Тест подключения к дополнительному API (только запрос списка моделей, без расхода генераций) */
async function testSubApiConnection() {
    _syncSubApiSettingsFromDom();
    const rawUrl = (settings.autoSummaryApiUrl || '').trim();
    const apiKey = (settings.autoSummaryApiKey || '').trim();
    const model = (settings.autoSummaryModel || '').trim();
    if (!rawUrl || !apiKey) {
        showToast('Сначала укажите адрес API и ключ', 'warning');
        return;
    }
    const btn = document.getElementById('horae-btn-test-sub-api');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Проверка...'; }
    try {
        const isGemini = /gemini/i.test(model);
        let testUrl, headers;
        if (isGemini) {
            let base = rawUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '').replace(/\/v\d+(beta\d*|alpha\d*)?(?:\/.*)?$/i, '');
            const isGoogle = /googleapis\.com|generativelanguage/i.test(base);
            testUrl = `${base}/v1beta/models` + (isGoogle ? `?key=${apiKey}` : '');
            headers = { 'Content-Type': 'application/json' };
            if (!isGoogle) headers['Authorization'] = `Bearer ${apiKey}`;
        } else {
            let base = rawUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
            if (!base.endsWith('/v1')) base = base.replace(/\/+$/, '') + '/v1';
            testUrl = `${base}/models`;
            headers = { 'Authorization': `Bearer ${apiKey}` };
        }
        const resp = await fetch(testUrl, { method: 'GET', headers, signal: AbortSignal.timeout(15000) });
        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`${resp.status}: ${errText.slice(0, 150)}`);
        }
        const data = await resp.json();
        const models = isGemini
            ? (data.models || []).map(m => m.name?.replace('models/', '') || m.displayName)
            : (data.data || data || []).map(m => m.id || m.name);
        const matchStr = model && models.some(m => m && m.toLowerCase().includes(model.toLowerCase()))
            ? `✓ Целевая модель «${model}» найдена` : (model ? `⚠ Модель «${model}» не найдена в списке, проверьте имя` : '');
        showToast(`Дополнительный API подключён! Моделей: ${models.length}${matchStr ? '. ' + matchStr : ''}`, 'success');
    } catch (err) {
        showToast(`Ошибка подключения к дополнительному API: ${err.message || err}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plug-circle-check"></i> Проверить соединение с дополнительным API'; }
    }
}

/** Прямой запрос к API, полностью независимый от основного подключения SillyTavern, поддерживает параллелизм */
async function generateWithDirectApi(prompt) {
    const _model = settings.autoSummaryModel.trim();
    const _apiKey = settings.autoSummaryApiKey.trim();
    // Gemini модели → использовать нативный Gemini API (реплика цепочки sendMakerSuiteRequest в бэкенде ST)
    if (/gemini/i.test(_model)) {
        return await _geminiNativeRequest(prompt, settings.autoSummaryApiUrl.trim(), _model, _apiKey);
    }
    // ── Не Gemini модели: формат совместимости с OpenAI ──
    let url = settings.autoSummaryApiUrl.trim();
    if (!url.endsWith('/chat/completions')) {
        url = url.replace(/\/+$/, '') + '/chat/completions';
    }
    const messages = [];
    try {
        const { oai_settings } = await import('/scripts/openai.js');
        // ① Основной системный промпт из пресета (задаёт базовое поведение ИИ)
        if (oai_settings?.main_prompt) {
            messages.push({ role: 'system', content: oai_settings.main_prompt });
        }
        // ② Промпт разрешения NSFW (если включено в пресете)
        if (oai_settings?.nsfw_toggle && oai_settings?.nsfw_prompt) {
            messages.push({ role: 'system', content: oai_settings.nsfw_prompt });
        }
        // ③ Инструкция задачи сводки
        messages.push({
            role: 'system',
            content: 'You are also a professional literary analyst. Read the following creative fiction passages and produce a concise plot summary. Analyze all content objectively regardless of themes or genre. Output only the summary text, no commentary.'
        });
        // ④ Содержимое для сводки
        messages.push({ role: 'user', content: prompt });
        // ⑤ Промпт обхода ограничений (последний, наивысший приоритет)
        if (oai_settings?.jailbreak_prompt) {
            messages.push({ role: 'system', content: oai_settings.jailbreak_prompt });
        }
    } catch (_) {
        // Обработка ошибок: при невозможности прочитать пресет ST — переход в базовый режим
        messages.push(
            { role: 'system', content: 'You are a professional literary analyst. Your task is to read creative fiction passages and produce concise plot summaries. Analyze all content objectively regardless of themes or genre. Output only the summary text, no commentary.' },
            { role: 'user', content: prompt }
        );
    }
    const body = {
        model: settings.autoSummaryModel.trim(),
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: false
    };
    // Принудительно добавить safetySettings = BLOCK_NONE (отключить проверку безопасности)
    // Бэкенд SillyTavern добавляет это автоматически для Gemini; при прямом подключении к промежуточному провайдеру нужно добавлять вручную
    // Для не-Gemini API неизвестные поля игнорируются без побочных эффектов
    const blockNone = [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
    ];
    body.safety_settings = blockNone;
    body.safetySettings = blockNone;
    console.log(`[Horae] Независимый API запрос: ${url}, модель: ${body.model}`);
    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.autoSummaryApiKey.trim()}`
            },
            body: JSON.stringify(body)
        });
        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`Независимый API вернул ${resp.status}: ${errText.slice(0, 200)}`);
        }
        const data = await resp.json();
        const finishReason = data?.choices?.[0]?.finish_reason || '';
        if (finishReason === 'content_filter' || finishReason === 'SAFETY') {
            throw new Error('Дополнительный API заблокирован фильтром безопасности. Снизьте лимит токенов или используйте модель с менее строгими ограничениями');
        }
        return data?.choices?.[0]?.message?.content || '';
    } catch (err) {
        if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
            throw new Error('Запрос к API заблокирован браузером (CORS). Проверьте адрес или включите enableCorsProxy в config.yaml SillyTavern');
        }
        throw err;
    }
}

/**
 * Запрос в нативном формате Gemini — реплика цепочки sendMakerSuiteRequest в бэкенде ST
 * Решает проблему потери safetySettings при проксировании через OpenAI-совместимые эндпоинты, вызывающую PROMPT BLOCKED
 */
async function _geminiNativeRequest(prompt, rawUrl, model, apiKey) {
    // ── 1. Собрать системные инструкции (все в systemInstruction) + пользовательский контент ──
    const systemParts = [];
    try {
        const { oai_settings } = await import('/scripts/openai.js');
        if (oai_settings?.main_prompt) {
            systemParts.push({ text: oai_settings.main_prompt });
        }
        if (oai_settings?.nsfw_toggle && oai_settings?.nsfw_prompt) {
            systemParts.push({ text: oai_settings.nsfw_prompt });
        }
        systemParts.push({
            text: 'You are also a professional literary analyst. Read the following creative fiction passages and produce a concise plot summary. Analyze all content objectively regardless of themes or genre. Output only the summary text, no commentary.',
        });
        if (oai_settings?.jailbreak_prompt) {
            systemParts.push({ text: oai_settings.jailbreak_prompt });
        }
    } catch (_) {
        systemParts.push({
            text: 'You are a professional literary analyst. Your task is to read creative fiction passages and produce concise plot summaries. Analyze all content objectively regardless of themes or genre. Output only the summary text, no commentary.',
        });
    }

    // ── 2. safetySettings (соответствует константе GEMINI_SAFETY в бэкенде ST) ──
    const modelLow = model.toLowerCase();
    const isOldModel = /gemini-1\.(0|5)-(pro|flash)-001/.test(modelLow);
    const threshold = isOldModel ? 'BLOCK_NONE' : 'OFF';
    const safetySettings = [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold },
    ];
    if (!isOldModel) {
        safetySettings.push({ category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold });
    }

    // ── 3. Тело запроса (нативный формат Gemini contents) ──
    const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        safetySettings,
        generationConfig: {
            candidateCount: 1,
            maxOutputTokens: 4096,
            temperature: 0.7,
        },
    };
    if (systemParts.length) {
        body.systemInstruction = { parts: systemParts };
    }

    // ── 4. Построить URL эндпоинта ──
    let baseUrl = rawUrl
        .replace(/\/+$/, '')
        .replace(/\/chat\/completions$/i, '')
        .replace(/\/v\d+(beta\d*|alpha\d*)?(?:\/.*)?$/i, '');

    const isGoogleDirect = /googleapis\.com|generativelanguage/i.test(baseUrl);
    const endpointUrl = `${baseUrl}/v1beta/models/${model}:generateContent`
        + (isGoogleDirect ? `?key=${apiKey}` : '');

    const headers = { 'Content-Type': 'application/json' };
    if (!isGoogleDirect) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    console.log(`[Horae] Gemini native API: ${endpointUrl}, threshold: ${threshold}`);

    // ── 5. Отправить запрос + разобрать нативный ответ ──
    try {
        const resp = await fetch(endpointUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`Gemini native API ${resp.status}: ${errText.slice(0, 300)}`);
        }

        const data = await resp.json();

        if (data?.promptFeedback?.blockReason) {
            throw new Error(`Gemini: входной запрос заблокирован (${data.promptFeedback.blockReason})`);
        }

        const candidates = data?.candidates;
        if (!candidates?.length) {
            throw new Error('Gemini API не вернул ни одного варианта');
        }

        if (candidates[0]?.finishReason === 'SAFETY') {
            throw new Error('Gemini: выходной ответ заблокирован фильтром. Используйте модель с менее строгими ограничениями');
        }

        const text = candidates[0]?.content?.parts
            ?.filter(p => !p.thought)
            ?.map(p => p.text)
            ?.join('\n\n') || '';

        if (!text) {
            throw new Error(`Gemini вернул пустой ответ (finishReason: ${candidates[0]?.finishReason || '?'})`);
        }

        return text;
    } catch (err) {
        if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
            throw new Error('Gemini native API заблокирован браузером (CORS). Проверьте адрес или включите enableCorsProxy в config.yaml SillyTavern');
        }
        throw err;
    }
}

/** Авто-сводка: проверить, нужно ли запускать */
async function checkAutoSummary() {
    if (!settings.autoSummaryEnabled || !settings.sendTimeline) return;
    if (_summaryInProgress) return;
    _summaryInProgress = true;
    
    try {
        const chat = horaeManager.getChat();
        if (!chat?.length) return;
        
        const keepRecent = settings.autoSummaryKeepRecent || 10;
        const bufferLimit = settings.autoSummaryBufferLimit || 20;
        const bufferMode = settings.autoSummaryBufferMode || 'messages';
        
        const totalMsgs = chat.length;
        const cutoff = Math.max(1, totalMsgs - keepRecent);
        
        // Собрать индексы сообщений, покрытых активными сводками (исключить независимо от is_hidden)
        const summarizedIndices = new Set();
        const existingSums = chat[0]?.horae_meta?.autoSummaries || [];
        for (const s of existingSums) {
            if (!s.active || !s.range) continue;
            for (let r = s.range[0]; r <= s.range[1]; r++) {
                summarizedIndices.add(r);
            }
        }
        
        const bufferMsgIndices = [];
        let bufferTokens = 0;
        for (let i = 0; i < cutoff; i++) {
            if (chat[i]?.is_hidden || summarizedIndices.has(i)) continue;
            if (chat[i]?.horae_meta?._skipHorae) continue;
            if (!chat[i]?.is_user && isEmptyOrCodeLayer(chat[i]?.mes)) continue;
            bufferMsgIndices.push(i);
            if (bufferMode === 'tokens') {
                bufferTokens += estimateTokens(chat[i]?.mes || '');
            }
        }
        
        let shouldTrigger = false;
        if (bufferMode === 'tokens') {
            shouldTrigger = bufferTokens > bufferLimit;
        } else {
            shouldTrigger = bufferMsgIndices.length > bufferLimit;
        }
        
        console.log(`[Horae] Авто-сводка: проверка ${bufferMsgIndices.length} буферных сообщений (${bufferMode === 'tokens' ? bufferTokens + 'tok' : bufferMsgIndices.length + ' записей'}), порог ${bufferLimit}, ${shouldTrigger ? 'запуск' : 'порог не достигнут'}`);
        
        if (!shouldTrigger || bufferMsgIndices.length === 0) return;
        
        // Лимит пакета за один раз: предотвратить взрыв токенов при первом включении на старых архивах
        const MAX_BATCH_MSGS = settings.autoSummaryBatchMaxMsgs || 50;
        const MAX_BATCH_TOKENS = settings.autoSummaryBatchMaxTokens || 80000;
        let batchIndices = [];
        let batchTokenCount = 0;
        for (const i of bufferMsgIndices) {
            const tok = estimateTokens(chat[i]?.mes || '');
            if (batchIndices.length > 0 && (batchIndices.length >= MAX_BATCH_MSGS || batchTokenCount + tok > MAX_BATCH_TOKENS)) break;
            batchIndices.push(i);
            batchTokenCount += tok;
        }
        const remaining = bufferMsgIndices.length - batchIndices.length;
        
        const bufferEvents = [];
        for (const i of batchIndices) {
            const meta = chat[i]?.horae_meta;
            if (!meta) continue;
            if (meta.event && !meta.events) {
                meta.events = [meta.event];
                delete meta.event;
            }
            if (!meta.events) continue;
            for (let j = 0; j < meta.events.length; j++) {
                const evt = meta.events[j];
                if (!evt?.summary || evt._compressedBy || evt.isSummary) continue;
                bufferEvents.push({
                    msgIdx: i, evtIdx: j,
                    date: meta.timestamp?.story_date || '?',
                    time: meta.timestamp?.story_time || '',
                    level: evt.level || '一般',
                    summary: evt.summary
                });
            }
        }
        
        // Проверить, нет ли в буфере сообщений без данных хронологии
        if (bufferEvents.length === 0) {
            const hasAnyHoraeMeta = batchIndices.some(i => chat[i]?.horae_meta?.timestamp?.story_date);
            if (!hasAnyHoraeMeta) {
                showToast('Авто-сводка: в буферных сообщениях нет данных хронологии Horae. Рекомендуется сначала использовать «ИИ-анализ» для восстановления хронологии.', 'warning');
                return;
            }
        }
        
        const batchMsg = remaining > 0
            ? `Авто-сводка: сжатие ${batchIndices.length}/${bufferMsgIndices.length} сообщений (осталось ${remaining} для следующего цикла)...`
            : `Авто-сводка: сжатие ${batchIndices.length} сообщений...`;
        showToast(batchMsg, 'info');
        
        const context = getContext();
        const userName = context?.name1 || 'Главный герой';
        
        const msgIndices = [...batchIndices].sort((a, b) => a - b);
        const fullTexts = msgIndices.map(idx => {
            const msg = chat[idx];
            const d = msg?.horae_meta?.timestamp?.story_date || '';
            const t = msg?.horae_meta?.timestamp?.story_time || '';
            return `【#${idx}${d ? ' ' + d : ''}${t ? ' ' + t : ''}】\n${msg?.mes || ''}`;
        });
        const sourceText = fullTexts.join('\n\n');
        
        const eventText = bufferEvents.map(e => `[${e.level}] ${e.date}${e.time ? ' ' + e.time : ''}: ${e.summary}`).join('\n');
        const autoSumTemplate = settings.customAutoSummaryPrompt || getDefaultAutoSummaryPrompt();
        const prompt = autoSumTemplate
            .replace(/\{\{events\}\}/gi, eventText)
            .replace(/\{\{fulltext\}\}/gi, sourceText)
            .replace(/\{\{count\}\}/gi, String(bufferEvents.length))
            .replace(/\{\{user\}\}/gi, userName);
        
        const response = await generateForSummary(prompt);
        if (!response?.trim()) {
            showToast('Авто-сводка: ИИ вернул пустой ответ', 'warning');
            return;
        }
        
        // Очистить теги horae из ответа ИИ, оставить только чистый текст сводки
        let summaryText = response.trim()
            .replace(/<horae>[\s\S]*?<\/horae>/gi, '')
            .replace(/<horaeevent>[\s\S]*?<\/horaeevent>/gi, '')
            .replace(/<!--horae[\s\S]*?-->/gi, '')
            .trim();
        if (!summaryText) {
            showToast('Авто-сводка: после очистки тегов контент пуст', 'warning');
            return;
        }

        const firstMsg = chat[0];
        if (!firstMsg.horae_meta) firstMsg.horae_meta = createEmptyMeta();
        if (!firstMsg.horae_meta.autoSummaries) firstMsg.horae_meta.autoSummaries = [];
        
        const originalEvents = bufferEvents.map(e => ({
            msgIdx: e.msgIdx, evtIdx: e.evtIdx,
            event: { ...chat[e.msgIdx]?.horae_meta?.events?.[e.evtIdx] },
            timestamp: chat[e.msgIdx]?.horae_meta?.timestamp
        }));
        
        // Полный диапазон скрытия (включая все USER-сообщения посередине)
        const hideMin = Math.max(1, msgIndices[0]);
        const hideMax = msgIndices[msgIndices.length - 1];

        const summaryId = `as_${Date.now()}`;
        firstMsg.horae_meta.autoSummaries.push({
            id: summaryId,
            range: [hideMin, hideMax],
            summaryText,
            originalEvents,
            active: true,
            createdAt: new Date().toISOString(),
            auto: true
        });
        
        // Пометить исходные события как сжатые (при active скрывать исходные, показывать сводку)
        for (const e of bufferEvents) {
            if (e.msgIdx === 0) continue;
            const meta = chat[e.msgIdx]?.horae_meta;
            if (meta?.events?.[e.evtIdx]) {
                meta.events[e.evtIdx]._compressedBy = summaryId;
            }
        }
        
        // Вставить карточку сводки: предпочтительно на сообщение с событиями, иначе на первое в диапазоне
        const targetIdx = bufferEvents.length > 0 ? bufferEvents[0].msgIdx : msgIndices[0];
        if (!chat[targetIdx].horae_meta) chat[targetIdx].horae_meta = createEmptyMeta();
        const targetMeta = chat[targetIdx].horae_meta;
        if (!targetMeta.events) targetMeta.events = [];
        targetMeta.events.push({
            is_important: true,
            level: '摘要',
            summary: summaryText,
            isSummary: true,
            _summaryId: summaryId
        });
        
        // /hide все сообщения в диапазоне
        const fullRangeIndices = [];
        for (let i = hideMin; i <= hideMax; i++) fullRangeIndices.push(i);
        await setMessagesHidden(chat, fullRangeIndices, true);
        
        await context.saveChat();
        updateTimelineDisplay();
        showToast(`Авто-сводка завершена: #${msgIndices[0]}-#${msgIndices[msgIndices.length - 1]}`, 'success');

        // Отложенная вторичная проверка: предотвратить перезапись is_hidden асинхронным saveChat
        setTimeout(() => {
            enforceHiddenState();
        }, 800);
    } catch (err) {
        console.error('[Horae] Ошибка авто-сводки:', err);
        showToast(`Ошибка авто-сводки: ${err.message || err}`, 'error');
    } finally {
        _summaryInProgress = false;
    }
}

/** Шаблон промпта сжатия сюжета по умолчанию (содержит два блока: сжатие событий и полный текст, разделены разделителем) */
function getDefaultCompressPrompt() {
    return `=====【Сжатие событий】=====
Ты — помощник по сжатию сюжета. Сожми следующие {{count}} событий в краткую сводку (100-200 символов), сохрани ключевую информацию и причинно-следственные связи.

{{events}}

Требования:
- Излагай в хронологическом порядке, сохраняй важные повороты
- Имена и названия мест сохраняй в оригинале
- Выводи только чистый текст, без разметки или форматирования
- Не упускай события уровня «ключевое» и «важное»
- {{user}} — имя главного героя
- Стиль: краткое объективное повествование

=====【Полный текст сводки】=====
Ты — помощник по сжатию сюжета. Прочитай следующий диалог и сожми его в краткую сводку (150-300 символов), сохрани ключевую информацию и причинно-следственные связи.

{{fulltext}}

Требования:
- Излагай в хронологическом порядке, сохраняй важные повороты и ключевые детали
- Имена и названия мест сохраняй в оригинале
- Выводи только чистый текст, без разметки или форматирования
- Сохраняй ключевые диалоги персонажей и их эмоциональные изменения
- {{user}} — имя главного героя
- Стиль: краткое объективное повествование`;
}

/** Промпт авто-сводки по умолчанию (независим от ручного сжатия, используется дополнительным API) */
function getDefaultAutoSummaryPrompt() {
    return `Ты — помощник по сжатию сюжета. Прочитай следующий диалог и сожми его в краткую сводку (150-300 символов), сохрани ключевую информацию и причинно-следственные связи.

{{fulltext}}

Имеющиеся краткие описания событий (для справки, не полагайся только на этот список):
{{events}}

Требования:
- Излагай в хронологическом порядке, сохраняй важные повороты и ключевые детали
- Имена и названия мест сохраняй в оригинале
- Выводи только чистый текст, без разметки или форматирования (запрещены XML-теги типа <horae>)
- Сохраняй ключевые диалоги персонажей и их эмоциональные изменения
- {{user}} — имя главного героя
- Стиль: краткое объективное повествование`;
}

/** Извлечь соответствующий блок промпта из шаблона по режиму */
function parseCompressPrompt(template, mode) {
    const eventRe = /=+【Сжатие событий】=+/;
    const fulltextRe = /=+【Полный текст сводки】=+/;
    const eMatch = template.match(eventRe);
    const fMatch = template.match(fulltextRe);
    if (eMatch && fMatch) {
        const eStart = eMatch.index + eMatch[0].length;
        const fStart = fMatch.index + fMatch[0].length;
        if (eMatch.index < fMatch.index) {
            const eventSection = template.substring(eStart, fMatch.index).trim();
            const fulltextSection = template.substring(fStart).trim();
            return mode === 'fulltext' ? fulltextSection : eventSection;
        } else {
            const fulltextSection = template.substring(fStart, eMatch.index).trim();
            const eventSection = template.substring(eStart).trim();
            return mode === 'fulltext' ? fulltextSection : eventSection;
        }
    }
    // Нет разделителя: весь текст используется как универсальный промпт
    return template;
}

/** Динамически обновлять подсказку лимита буфера в зависимости от режима */
function updateAutoSummaryHint() {
    const hintEl = document.getElementById('horae-auto-summary-limit-hint');
    if (!hintEl) return;
    const mode = settings.autoSummaryBufferMode || 'messages';
    if (mode === 'tokens') {
        hintEl.innerHTML = 'Введите лимит токенов. При превышении запускается автосжатие.<br>' +
            '<small>Ориентир: Claude ≈ 80K~200K · GPT-4o ≈ 128K · Gemini ≈ 1M~2M<br>' +
            'Рекомендуется 30–50% от контекстного окна модели.</small>';
    } else {
        hintEl.innerHTML = 'Введите количество сообщений. При превышении запускается автосжатие.<br>' +
            '<small>Когда сообщений сверх «хранить последних» становится больше этого числа, они автоматически сжимаются.</small>';
    }
}

/** Оценить количество токенов текста (CJK: 1.5, остальные: 0.4) */
function estimateTokens(text) {
    if (!text) return 0;
    const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
    const rest = text.length - cjk;
    return Math.ceil(cjk * 1.5 + rest * 0.4);
}

/** Проверить, является ли сообщение пустым (системная отрисовка кода без нарративного содержания) */
function isEmptyOrCodeLayer(mes) {
    if (!mes) return true;
    const stripped = mes
        .replace(/<[^>]*>/g, '')
        .replace(/\{\{[^}]*\}\}/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .trim();
    return stripped.length < 20;
}

/** ИИ-анализ — пакетный анализ истории сообщений, сохранение результатов, открытие окна проверки */
async function batchAIScan() {
    const chat = horaeManager.getChat();
    if (!chat || chat.length === 0) {
        showToast('Нет истории чата', 'warning');
        return;
    }

    const targets = [];
    let skippedEmpty = 0;
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        if (msg.is_user) continue;
        if (isEmptyOrCodeLayer(msg.mes)) { skippedEmpty++; continue; }
        const meta = msg.horae_meta;
        if (meta?.events?.length > 0) continue;
        targets.push({ index: i, text: msg.mes });
    }

    if (targets.length === 0) {
        const hint = skippedEmpty > 0 ? `(пропущено ${skippedEmpty} пустых/системных сообщений)` : '';
        showToast(`Все сообщения уже имеют данные хронологии, дополнение не требуется${hint}`, 'info');
        return;
    }

    const scanConfig = await showAIScanConfigDialog(targets.length);
    if (!scanConfig) return;
    const { tokenLimit, includeNpc, includeAffection, includeScene, includeRelationship } = scanConfig;

    const batches = [];
    let currentBatch = [], currentTokens = 0;
    for (const t of targets) {
        const tokens = estimateTokens(t.text);
        if (currentBatch.length > 0 && currentTokens + tokens > tokenLimit) {
            batches.push(currentBatch);
            currentBatch = [];
            currentTokens = 0;
        }
        currentBatch.push(t);
        currentTokens += tokens;
    }
    if (currentBatch.length > 0) batches.push(currentBatch);

    const skippedHint = skippedEmpty > 0 ? `\n· Пропущено ${skippedEmpty} пустых/системных сообщений` : '';
    const confirmMsg = `Планируется ${batches.length} пакетов, расход ${batches.length} генераций\n\n· Только дополняет сообщения без хронологии, не перезаписывает имеющиеся данные\n· Отмена сохранит уже завершённые пакеты\n· После сканирования можно «Отменить анализ»${skippedHint}\n\nПродолжить?`;
    if (!confirm(confirmMsg)) return;

    const scanResults = await executeBatchScan(batches, { includeNpc, includeAffection, includeScene, includeRelationship });
    if (scanResults.length === 0) {
        showToast('Не удалось извлечь данные', 'warning');
        return;
    }
    showScanReviewModal(scanResults, { includeNpc, includeAffection, includeScene, includeRelationship });
}

/** Выполнить пакетное сканирование, вернуть промежуточные результаты (не записывать в диалог) */
async function executeBatchScan(batches, options = {}) {
    const { includeNpc, includeAffection, includeScene, includeRelationship } = options;
    let cancelled = false;
    let cancelResolve = null;
    const cancelPromise = new Promise(resolve => { cancelResolve = resolve; });

    // AbortController для прерывания HTTP-запроса (на уровне fetch)
    const fetchAbort = new AbortController();
    const _origFetch = window.fetch;
    window.fetch = function(input, init = {}) {
        if (!cancelled) {
            const ourSignal = fetchAbort.signal;
            if (init.signal && typeof AbortSignal.any === 'function') {
                init.signal = AbortSignal.any([init.signal, ourSignal]);
            } else {
                init.signal = ourSignal;
            }
        }
        return _origFetch.call(this, input, init);
    };

    const overlay = document.createElement('div');
    overlay.className = 'horae-progress-overlay' + (isLightMode() ? ' horae-light' : '');
    overlay.innerHTML = `
        <div class="horae-progress-container">
            <div class="horae-progress-title">ИИ-анализ...</div>
            <div class="horae-progress-bar">
                <div class="horae-progress-fill" style="width: 0%"></div>
            </div>
            <div class="horae-progress-text">Подготовка...</div>
            <button class="horae-progress-cancel"><i class="fa-solid fa-xmark"></i> Отмена</button>
        </div>
    `;
    document.body.appendChild(overlay);
    const fillEl = overlay.querySelector('.horae-progress-fill');
    const textEl = overlay.querySelector('.horae-progress-text');
    const context = getContext();
    const userName = context?.name1 || 'Главный герой';

    // Отмена: прервать fetch + stopGeneration + выход через Promise.race
    overlay.querySelector('.horae-progress-cancel').addEventListener('click', () => {
        if (cancelled) return;
        const hasPartial = scanResults.length > 0;
        const hint = hasPartial
            ? `Завершено ${scanResults.length} сводок будет сохранено, можно просмотреть в окне проверки.\n\nОстановить оставшиеся пакеты?`
            : 'Текущий пакет ещё не завершён. Отменить?';
        if (!confirm(hint)) return;
        cancelled = true;
        fetchAbort.abort();
        try { context.stopGeneration(); } catch (_) {}
        cancelResolve();
        overlay.remove();
        showToast(hasPartial ? `Остановлено, сохранено ${scanResults.length} завершённых сводок` : 'Генерация сводок отменена', 'info');
    });
    const scanResults = [];

    // Динамически строить список разрешённых тегов
    let allowedTags = 'time、item、event';
    let forbiddenNote = 'Не выводить теги agenda/costume/location/atmosphere/characters';
    if (!includeNpc) forbiddenNote += '/npc';
    if (!includeAffection) forbiddenNote += '/affection';
    if (!includeScene) forbiddenNote += '/scene_desc';
    if (!includeRelationship) forbiddenNote += '/rel';
    forbiddenNote += ' и другие теги';
    if (includeNpc) allowedTags += '、npc';
    if (includeAffection) allowedTags += '、affection';
    if (includeScene) allowedTags += '、scene_desc';
    if (includeRelationship) allowedTags += '、rel';

    for (let b = 0; b < batches.length; b++) {
        if (cancelled) break;
        const batch = batches[b];
        textEl.textContent = `Пакет ${b + 1}/${batches.length} (${batch.length} сообщений)...`;
        fillEl.style.width = `${Math.round((b / batches.length) * 100)}%`;

        const messagesBlock = batch.map(t => `[Сообщение#${t.index}]\n${t.text}`).join('\n\n');

        // Пользовательский промпт или по умолчанию
        let batchPrompt;
        if (settings.customBatchPrompt) {
            batchPrompt = settings.customBatchPrompt
                .replace(/\{\{user\}\}/gi, userName)
                .replace(/\{\{messages\}\}/gi, messagesBlock);
        } else {
            let extraFormat = '';
            let extraRules = '';
            if (includeNpc) {
                extraFormat += `\nnpc:имя_персонажа|внешность=характер@отношения_с_${userName}~性别:значение~年龄:значение~种族:значение~职业:значение (только при первом появлении или смене данных)`;
                extraRules += `\n· NPC: при первом появлении — полная запись (включая ~доп.поля), затем только изменения`;
            }
            if (includeAffection) {
                extraFormat += `\naffection:имя_персонажа=значение_расположения (только расположение NPC к ${userName}, извлекать имеющиеся числа из текста)`;
                extraRules += `\n· Расположение: извлекай только явно указанные значения из текста, не делай предположений`;
            }
            if (includeScene) {
                extraFormat += `\nlocation:название_текущего_места (место сцены, многоуровневое через · напр. «Таверна·Зал»)\nscene_desc:находится... Описание постоянных физических характеристик места (50-150 символов, только при первом посещении или постоянных изменениях)`;
                extraRules += `\n· Локация: строку location пиши для каждого сообщения; scene_desc — только при первом посещении нового места; для дочерних мест пиши только положение относительно родителя`;
            }
            if (includeRelationship) {
                extraFormat += `\nrel:ПерсонажA>ПерсонажB=тип_отношений|примечание (выводить при изменении отношений)`;
                extraRules += `\n· Отношения: писать только при новых/изменившихся отношениях, формат rel:ПерсонажA>ПерсонажB=тип, примечание необязательно`;
            }

            batchPrompt = `Ты — помощник по анализу сюжета. Проанализируй каждое сообщение в диалоге и извлеки [${allowedTags}].

Основные принципы:
- Извлекай только явно указанную информацию, не выдумывай
- Анализируй каждое сообщение отдельно, разделяй через ===Сообщение#номер===
- Выводи только теги ${allowedTags}, ${forbiddenNote}

${messagesBlock}

[Формат вывода] Для каждого сообщения:

===Сообщение#номер===
<horae>
time:дата время (из текста, напр. 2026/2/4 15:00 или Третий день месяца Заморозков, сумерки)
item:emoji название_предмета(кол-во)|описание=владелец@местоположение (новые предметы, описание необязательно для обычных)
item!:emoji название_предмета(кол-во)|описание=владелец@местоположение (важный предмет, описание обязательно)
item-:название_предмета (израсходованные/утерянные предметы)${extraFormat}
</horae>
<horaeevent>
event:уровень|краткое описание события (30-50 символов, уровень: обычное/важное/ключевое — но значения тегов: 一般/重要/关键)
</horaeevent>

[Правила]
· time: извлеки дату и время текущей сцены, обязательно (если нет явного времени — используй контекст)
· event: ключевые события в данном сообщении, минимум одно event на сообщение
· Предметы записывай только при получении, расходе или смене состояния; если нет изменений — пропускай строку item
· Формат item: emoji-префикс напр. 🔑🍞, для одной единицы не пиши (1), местоположение точное (❌ на полу ✅ на столе в зале таверны)
· Уровень важности: повседневный диалог=一般 (обычное), движение сюжета=重要 (важное), ключевой поворот=关键 (ключевое)
· ${userName} — имя главного героя${extraRules}
· Ещё раз: выводи только ${allowedTags}, ${forbiddenNote}`;
        }

        try {
            const response = await Promise.race([
                context.generateRaw({ prompt: batchPrompt }),
                cancelPromise.then(() => null)
            ]);
            if (cancelled) break;
            if (!response) {
                console.warn(`[Horae] Пакет ${b + 1}: ИИ не вернул содержимого`);
                showToast(`Пакет ${b + 1}: ИИ не вернул содержимого (возможно, заблокировано цензурой)`, 'warning');
                continue;
            }
            const segments = response.split(/===Сообщение#(\d+)===/);
            if (segments.length <= 1) {
                console.warn(`[Horae] Пакет ${b + 1}: формат ответа ИИ не совпадает (не найден разделитель ===Сообщение#N===)`, response.substring(0, 300));
                showToast(`Пакет ${b + 1}: формат ответа ИИ не совпадает, повторите`, 'warning');
                continue;
            }
            for (let s = 1; s < segments.length; s += 2) {
                const msgIndex = parseInt(segments[s]);
                const content = segments[s + 1] || '';
                if (isNaN(msgIndex)) continue;
                const parsed = horaeManager.parseHoraeTag(content);
                if (parsed) {
                    parsed.costumes = {};
                    if (!includeScene) parsed.scene = {};
                    parsed.agenda = [];
                    parsed.deletedAgenda = [];
                    parsed.deletedItems = [];
                    if (!includeNpc) parsed.npcs = {};
                    if (!includeAffection) parsed.affection = {};
                    if (!includeRelationship) parsed.relationships = [];

                    const existingMeta = horaeManager.getMessageMeta(msgIndex) || createEmptyMeta();
                    const newMeta = horaeManager.mergeParsedToMeta(existingMeta, parsed);
                    if (newMeta._tableUpdates) {
                        newMeta.tableContributions = newMeta._tableUpdates;
                        delete newMeta._tableUpdates;
                    }
                    newMeta._aiScanned = true;

                    const chatRef = horaeManager.getChat();
                    const preview = (chatRef[msgIndex]?.mes || '').substring(0, 60);
                    scanResults.push({ msgIndex, newMeta, preview, _deleted: false });
                }
            }
        } catch (err) {
            if (cancelled || err?.name === 'AbortError') break;
            console.error(`[Horae] Ошибка сводки пакета ${b + 1}:`, err);
            showToast(`Пакет ${b + 1}: ошибка запроса ИИ, проверьте подключение к API`, 'error');
        }

        if (b < batches.length - 1 && !cancelled) {
            textEl.textContent = `Пакет ${b + 1} завершён, ожидание...`;
            await Promise.race([
                new Promise(r => setTimeout(r, 2000)),
                cancelPromise
            ]);
        }
    }
    window.fetch = _origFetch;
    if (!cancelled) overlay.remove();
    return scanResults;
}

/** Извлечь позиции проверки из промежуточных результатов по категориям */
function extractReviewCategories(scanResults) {
    const categories = { events: [], items: [], npcs: [], affection: [], scenes: [], relationships: [] };

    for (let ri = 0; ri < scanResults.length; ri++) {
        const r = scanResults[ri];
        if (r._deleted) continue;
        const meta = r.newMeta;

        if (meta.events?.length > 0) {
            for (let ei = 0; ei < meta.events.length; ei++) {
                categories.events.push({
                    resultIndex: ri, field: 'events', subIndex: ei,
                    msgIndex: r.msgIndex,
                    time: meta.timestamp?.story_date || '',
                    level: meta.events[ei].level || '一般',
                    text: meta.events[ei].summary || ''
                });
            }
        }

        for (const [name, info] of Object.entries(meta.items || {})) {
            const desc = info.description || '';
            const loc = [info.holder, info.location ? `@${info.location}` : ''].filter(Boolean).join('');
            categories.items.push({
                resultIndex: ri, field: 'items', key: name,
                msgIndex: r.msgIndex,
                text: `${info.icon || ''}${name}`,
                sub: loc,
                desc: desc
            });
        }

        for (const [name, info] of Object.entries(meta.npcs || {})) {
            categories.npcs.push({
                resultIndex: ri, field: 'npcs', key: name,
                msgIndex: r.msgIndex,
                text: name,
                sub: [info.appearance, info.personality, info.relationship].filter(Boolean).join(' / ')
            });
        }

        for (const [name, val] of Object.entries(meta.affection || {})) {
            categories.affection.push({
                resultIndex: ri, field: 'affection', key: name,
                msgIndex: r.msgIndex,
                text: name,
                sub: `${typeof val === 'object' ? val.value : val}`
            });
        }

        // Память о локациях
        if (meta.scene?.location && meta.scene?.scene_desc) {
            categories.scenes.push({
                resultIndex: ri, field: 'scene', key: meta.scene.location,
                msgIndex: r.msgIndex,
                text: meta.scene.location,
                sub: meta.scene.scene_desc
            });
        }

        // Сеть отношений
        if (meta.relationships?.length > 0) {
            for (let rri = 0; rri < meta.relationships.length; rri++) {
                const rel = meta.relationships[rri];
                categories.relationships.push({
                    resultIndex: ri, field: 'relationships', subIndex: rri,
                    msgIndex: r.msgIndex,
                    text: `${rel.from} → ${rel.to}`,
                    sub: `${rel.type}${rel.note ? ' | ' + rel.note : ''}`
                });
            }
        }
    }

    // Дедупликация расположения: для одноимённых NPC сохранять только последнее значение (итоговое)
    const affMap = new Map();
    for (const item of categories.affection) {
        affMap.set(item.text, item);
    }
    categories.affection = [...affMap.values()];

    // Дедупликация локаций: для одноимённых мест сохранять только последнее описание
    const sceneMap = new Map();
    for (const item of categories.scenes) {
        sceneMap.set(item.text, item);
    }
    categories.scenes = [...sceneMap.values()];

    categories.events.sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.msgIndex - b.msgIndex);
    return categories;
}

/** Уникальный идентификатор позиции проверки */
function makeReviewKey(item) {
    if (item.field === 'events') return `${item.resultIndex}-events-${item.subIndex}`;
    if (item.field === 'relationships') return `${item.resultIndex}-relationships-${item.subIndex}`;
    return `${item.resultIndex}-${item.field}-${item.key}`;
}

/** Диалог проверки сводок — отображение по категориям, поддержка удаления и дополнения */
function showScanReviewModal(scanResults, scanOptions) {
    const categories = extractReviewCategories(scanResults);
    const deletedSet = new Set();

    const tabs = [
        { id: 'events', label: 'Хронология', icon: 'fa-clock-rotate-left', items: categories.events },
        { id: 'items', label: 'Предметы', icon: 'fa-box-open', items: categories.items },
        { id: 'npcs', label: 'Персонажи', icon: 'fa-user', items: categories.npcs },
        { id: 'affection', label: 'Расположение', icon: 'fa-heart', items: categories.affection },
        { id: 'scenes', label: 'Сцена', icon: 'fa-map-location-dot', items: categories.scenes },
        { id: 'relationships', label: 'Отношения', icon: 'fa-people-arrows', items: categories.relationships }
    ].filter(t => t.items.length > 0);

    if (tabs.length === 0) {
        showToast('Не удалось извлечь данные', 'warning');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'horae-modal horae-review-modal' + (isLightMode() ? ' horae-light' : '');

    const activeTab = tabs[0].id;
    const tabsHtml = tabs.map(t =>
        `<button class="horae-review-tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">
            <i class="fa-solid ${t.icon}"></i> ${t.label} <span class="tab-count">${t.items.length}</span>
        </button>`
    ).join('');

    const panelsHtml = tabs.map(t => {
        const itemsHtml = t.items.map(item => {
            const itemKey = escapeHtml(makeReviewKey(item));
            const levelAttr = item.level ? ` data-level="${escapeHtml(item.level)}"` : '';
            const itemLevelDisplayMap = {'一般': 'Обычн.', '重要': 'Важное', '关键': 'Ключ.'};
            const itemLevelDisplay = itemLevelDisplayMap[item.level] || item.level || '';
            const levelBadge = item.level ? `<span class="horae-level-badge ${item.level === '关键' ? 'critical' : item.level === '重要' ? 'important' : ''}" style="font-size:10px;margin-right:4px;">${escapeHtml(itemLevelDisplay)}</span>` : '';
            const descHtml = item.desc ? `<div class="horae-review-item-sub" style="font-style:italic;opacity:0.8;">📝 ${escapeHtml(item.desc)}</div>` : '';
            return `<div class="horae-review-item" data-key="${itemKey}"${levelAttr}>
                <div class="horae-review-item-body">
                    <div class="horae-review-item-title">${levelBadge}${escapeHtml(item.text)}</div>
                    ${item.sub ? `<div class="horae-review-item-sub">${escapeHtml(item.sub)}</div>` : ''}
                    ${descHtml}
                    ${item.time ? `<div class="horae-review-item-sub">${escapeHtml(item.time)}</div>` : ''}
                    <div class="horae-review-item-msg">#${item.msgIndex}</div>
                </div>
                <button class="horae-review-delete-btn" data-key="${itemKey}" title="Удалить/восстановить">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>`;
        }).join('');
        return `<div class="horae-review-panel ${t.id === activeTab ? 'active' : ''}" data-panel="${t.id}">
            ${itemsHtml || '<div class="horae-review-empty">Нет данных</div>'}
        </div>`;
    }).join('');

    const totalCount = tabs.reduce((s, t) => s + t.items.length, 0);

    modal.innerHTML = `
        <div class="horae-modal-content">
            <div class="horae-modal-header">
                <span>Проверка сводок</span>
                <span style="font-size:12px;color:var(--horae-text-muted);">Всего: ${totalCount}</span>
            </div>
            <div class="horae-review-tabs">${tabsHtml}</div>
            <div class="horae-review-body">${panelsHtml}</div>
            <div class="horae-modal-footer horae-review-footer">
                <div class="horae-review-stats">Удалено: <strong id="horae-review-del-count">0</strong></div>
                <div class="horae-review-actions">
                    <button class="horae-btn" id="horae-review-cancel"><i class="fa-solid fa-xmark"></i> Отмена</button>
                    <button class="horae-btn primary" id="horae-review-rescan" disabled style="opacity:0.5;"><i class="fa-solid fa-wand-magic-sparkles"></i> Дополнить сводки</button>
                    <button class="horae-btn primary" id="horae-review-confirm"><i class="fa-solid fa-check"></i> Подтвердить и сохранить</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Переключение вкладок
    modal.querySelectorAll('.horae-review-tab').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => {
            modal.querySelectorAll('.horae-review-tab').forEach(t => t.classList.remove('active'));
            modal.querySelectorAll('.horae-review-panel').forEach(p => p.classList.remove('active'));
            tabBtn.classList.add('active');
            modal.querySelector(`.horae-review-panel[data-panel="${tabBtn.dataset.tab}"]`)?.classList.add('active');
        });
    });

    // Переключение удалить/восстановить
    modal.querySelectorAll('.horae-review-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            const itemEl = btn.closest('.horae-review-item');
            if (deletedSet.has(key)) {
                deletedSet.delete(key);
                itemEl.classList.remove('deleted');
                btn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
            } else {
                deletedSet.add(key);
                itemEl.classList.add('deleted');
                btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
            }
            updateReviewStats();
        });
    });

    function updateReviewStats() {
        const count = deletedSet.size;
        modal.querySelector('#horae-review-del-count').textContent = count;
        const rescanBtn = modal.querySelector('#horae-review-rescan');
        rescanBtn.disabled = count === 0;
        rescanBtn.style.opacity = count === 0 ? '0.5' : '1';
        for (const t of tabs) {
            const remain = t.items.filter(i => !deletedSet.has(makeReviewKey(i))).length;
            const badge = modal.querySelector(`.horae-review-tab[data-tab="${t.id}"] .tab-count`);
            if (badge) badge.textContent = remain;
        }
    }

    // Подтвердить и сохранить
    modal.querySelector('#horae-review-confirm').addEventListener('click', async () => {
        applyDeletedToResults(scanResults, deletedSet, categories);
        let saved = 0;
        for (const r of scanResults) {
            if (r._deleted) continue;
            const m = r.newMeta;
            const hasData = (m.events?.length > 0) || Object.keys(m.items || {}).length > 0 ||
                Object.keys(m.npcs || {}).length > 0 || Object.keys(m.affection || {}).length > 0 ||
                m.timestamp?.story_date || (m.scene?.scene_desc) || (m.relationships?.length > 0);
            if (!hasData) continue;
            m._aiScanned = true;
            // Записать память о локациях в locationMemory
            if (m.scene?.location && m.scene?.scene_desc) {
                horaeManager._updateLocationMemory(m.scene.location, m.scene.scene_desc);
            }
            // Слияние данных сети отношений
            if (m.relationships?.length > 0) {
                horaeManager._mergeRelationships(m.relationships);
            }
            horaeManager.setMessageMeta(r.msgIndex, m);
            injectHoraeTagToMessage(r.msgIndex, m);
            saved++;
        }
        horaeManager.rebuildTableData();
        await getContext().saveChat();
        modal.remove();
        showToast(`Сохранено ${saved} сводок`, 'success');
        refreshAllDisplays();
        renderCustomTablesList();
    });

    // Отмена
    const closeModal = () => { if (confirm('Закрыть окно проверки? Несохранённые сводки будут потеряны.\n(Можно запустить «ИИ-анализ» снова для продолжения)')) modal.remove(); };
    modal.querySelector('#horae-review-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    // Дополнить сводки — повторно обработать сообщения с удалёнными записями
    modal.querySelector('#horae-review-rescan').addEventListener('click', async () => {
        const deletedMsgIndices = new Set();
        for (const key of deletedSet) {
            const ri = parseInt(key.split('-')[0]);
            if (!isNaN(ri) && scanResults[ri]) deletedMsgIndices.add(scanResults[ri].msgIndex);
        }
        if (deletedMsgIndices.size === 0) return;
        if (!confirm(`Будет повторно сгенерировано ${deletedMsgIndices.size} сообщений, минимум 1 генерация.\n\nПродолжить?`)) return;

        applyDeletedToResults(scanResults, deletedSet, categories);

        const chat = horaeManager.getChat();
        const rescanTargets = [];
        for (const idx of deletedMsgIndices) {
            if (chat[idx]?.mes) rescanTargets.push({ index: idx, text: chat[idx].mes });
        }
        if (rescanTargets.length === 0) return;

        modal.remove();

        const tokenLimit = 80000;
        const rescanBatches = [];
        let cb = [], ct = 0;
        for (const t of rescanTargets) {
            const tk = estimateTokens(t.text);
            if (cb.length > 0 && ct + tk > tokenLimit) { rescanBatches.push(cb); cb = []; ct = 0; }
            cb.push(t); ct += tk;
        }
        if (cb.length > 0) rescanBatches.push(cb);

        const newResults = await executeBatchScan(rescanBatches, scanOptions);
        const merged = scanResults.filter(r => !r._deleted).concat(newResults);
        showScanReviewModal(merged, scanOptions);
    });
}

/** Применить метки удаления к фактическим данным scanResults */
function applyDeletedToResults(scanResults, deletedSet, categories) {
    const deleteMap = new Map();
    const allItems = [...categories.events, ...categories.items, ...categories.npcs, ...categories.affection, ...categories.scenes, ...categories.relationships];
    for (const key of deletedSet) {
        const item = allItems.find(i => makeReviewKey(i) === key);
        if (!item) continue;
        if (!deleteMap.has(item.resultIndex)) {
            deleteMap.set(item.resultIndex, { events: new Set(), items: new Set(), npcs: new Set(), affection: new Set(), scene: new Set(), relationships: new Set() });
        }
        const dm = deleteMap.get(item.resultIndex);
        if (item.field === 'events') dm.events.add(item.subIndex);
        else if (item.field === 'relationships') dm.relationships.add(item.subIndex);
        else if (item.field === 'scene') dm.scene.add(item.key);
        else dm[item.field]?.add(item.key);
    }

    for (const [ri, dm] of deleteMap) {
        const meta = scanResults[ri]?.newMeta;
        if (!meta) continue;
        if (dm.events.size > 0 && meta.events) {
            const indices = [...dm.events].sort((a, b) => b - a);
            for (const idx of indices) meta.events.splice(idx, 1);
        }
        if (dm.relationships.size > 0 && meta.relationships) {
            const indices = [...dm.relationships].sort((a, b) => b - a);
            for (const idx of indices) meta.relationships.splice(idx, 1);
        }
        if (dm.scene.size > 0 && meta.scene) {
            meta.scene = {};
        }
        for (const name of dm.items) delete meta.items?.[name];
        for (const name of dm.npcs) delete meta.npcs?.[name];
        for (const name of dm.affection) delete meta.affection?.[name];

        const hasData = (meta.events?.length > 0) || Object.keys(meta.items || {}).length > 0 ||
            Object.keys(meta.npcs || {}).length > 0 || Object.keys(meta.affection || {}).length > 0 ||
            (meta.scene?.scene_desc) || (meta.relationships?.length > 0);
        if (!hasData) scanResults[ri]._deleted = true;
    }
}

/** Диалог настройки ИИ-анализа */
function showAIScanConfigDialog(targetCount) {
    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'horae-modal' + (isLightMode() ? ' horae-light' : '');
        modal.innerHTML = `
            <div class="horae-modal-content" style="max-width: 420px;">
                <div class="horae-modal-header">
                    <span>ИИ-анализ</span>
                </div>
                <div class="horae-modal-body" style="padding: 16px;">
                    <p style="margin: 0 0 12px; color: var(--horae-text-muted); font-size: 13px;">
                        Обнаружено <strong style="color: var(--horae-primary-light);">${targetCount}</strong> сообщений без хронологии (уже имеющие данные пропускаются автоматически)
                    </p>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--horae-text);">
                        Лимит токенов на пакет
                        <input type="number" id="horae-ai-scan-token-limit" value="80000" min="10000" max="1000000" step="10000"
                            style="flex:1; padding: 6px 10px; background: var(--horae-bg); border: 1px solid var(--horae-border); border-radius: 4px; color: var(--horae-text); font-size: 13px;">
                    </label>
                    <p style="margin: 8px 0 12px; color: var(--horae-text-muted); font-size: 11px;">
                        Больше значение = больше сообщений за раз, меньше генераций, но возможен выход за пределы модели.<br>
                        Claude ≈ 80K~200K · Gemini ≈ 100K~1000K · GPT-4o ≈ 80K~128K
                    </p>
                    <div style="border-top: 1px solid var(--horae-border); padding-top: 12px;">
                        <p style="margin: 0 0 8px; font-size: 12px; color: var(--horae-text);">Дополнительные данные (необязательно)</p>
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--horae-text); margin-bottom: 6px; cursor: pointer;">
                            <input type="checkbox" id="horae-scan-include-npc" ${settings.aiScanIncludeNpc ? 'checked' : ''}>
                            Информация о персонажах (NPC)
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--horae-text); cursor: pointer;">
                            <input type="checkbox" id="horae-scan-include-affection" ${settings.aiScanIncludeAffection ? 'checked' : ''}>
                            Расположение
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--horae-text); margin-top: 6px; cursor: pointer;">
                            <input type="checkbox" id="horae-scan-include-scene" ${settings.aiScanIncludeScene ? 'checked' : ''}>
                            Память о локациях (описание физических характеристик)
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--horae-text); margin-top: 6px; cursor: pointer;">
                            <input type="checkbox" id="horae-scan-include-relationship" ${settings.aiScanIncludeRelationship ? 'checked' : ''}>
                            Сеть отношений
                        </label>
                        <p style="margin: 6px 0 0; color: var(--horae-text-muted); font-size: 10px;">
                            Извлечение информации из текста истории. После этого можно проверить каждую запись в окне проверки.
                        </p>
                    </div>
                </div>
                <div class="horae-modal-footer">
                    <button class="horae-btn" id="horae-ai-scan-cancel">Отмена</button>
                    <button class="horae-btn primary" id="horae-ai-scan-confirm">Продолжить</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#horae-ai-scan-confirm').addEventListener('click', () => {
            const val = parseInt(modal.querySelector('#horae-ai-scan-token-limit').value) || 80000;
            const includeNpc = modal.querySelector('#horae-scan-include-npc').checked;
            const includeAffection = modal.querySelector('#horae-scan-include-affection').checked;
            const includeScene = modal.querySelector('#horae-scan-include-scene').checked;
            const includeRelationship = modal.querySelector('#horae-scan-include-relationship').checked;
            settings.aiScanIncludeNpc = includeNpc;
            settings.aiScanIncludeAffection = includeAffection;
            settings.aiScanIncludeScene = includeScene;
            settings.aiScanIncludeRelationship = includeRelationship;
            saveSettings();
            modal.remove();
            resolve({ tokenLimit: Math.max(10000, val), includeNpc, includeAffection, includeScene, includeRelationship });
        });
        modal.querySelector('#horae-ai-scan-cancel').addEventListener('click', () => {
            modal.remove();
            resolve(null);
        });
        modal.addEventListener('click', e => {
            if (e.target === modal) { modal.remove(); resolve(null); }
        });
    });
}

/** Отмена ИИ-анализа — очистить все данные с меткой _aiScanned */
async function undoAIScan() {
    const chat = horaeManager.getChat();
    if (!chat || chat.length === 0) return;

    let count = 0;
    for (let i = 0; i < chat.length; i++) {
        if (chat[i].horae_meta?._aiScanned) count++;
    }

    if (count === 0) {
        showToast('Данные ИИ-анализа не найдены', 'info');
        return;
    }

    if (!confirm(`Будут очищены данные ИИ-анализа из ${count} сообщений (события и предметы).\nВручную отредактированные данные затронуты не будут.\n\nПродолжить?`)) return;

    for (let i = 0; i < chat.length; i++) {
        const meta = chat[i].horae_meta;
        if (!meta?._aiScanned) continue;
        meta.events = [];
        meta.items = {};
        delete meta._aiScanned;
        horaeManager.setMessageMeta(i, meta);
    }

    horaeManager.rebuildTableData();
    await getContext().saveChat();
    showToast(`Отменён ИИ-анализ для ${count} сообщений`, 'success');
    refreshAllDisplays();
    renderCustomTablesList();
}

/**
 * Экспорт данных
 */
function exportData() {
    const chat = horaeManager.getChat();
    const exportObj = {
        version: VERSION,
        exportTime: new Date().toISOString(),
        data: chat.map((msg, index) => ({
            index,
            horae_meta: msg.horae_meta || null
        })).filter(item => item.horae_meta)
    };
    
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `horae_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Данные экспортированы', 'success');
}

/**
 * Импорт данных (поддерживает два режима)
 */
function importData() {
    const mode = confirm(
        'Выберите режим импорта:\n\n' +
        '[OK] → Импорт по номеру сообщения (восстановление в том же диалоге)\n' +
        '[Отмена] → Импорт как начальное состояние (новый диалог наследует метаданные)'
    ) ? 'match' : 'initial';
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const importObj = JSON.parse(text);
            
            if (!importObj.data || !Array.isArray(importObj.data)) {
                throw new Error('Неверный формат данных');
            }
            
            const chat = horaeManager.getChat();
            
            if (mode === 'match') {
                let imported = 0;
                for (const item of importObj.data) {
                    if (item.index >= 0 && item.index < chat.length && item.horae_meta) {
                        chat[item.index].horae_meta = item.horae_meta;
                        imported++;
                    }
                }
                await getContext().saveChat();
                showToast(`Успешно импортировано ${imported} записей`, 'success');
            } else {
                _importAsInitialState(importObj, chat);
                await getContext().saveChat();
                showToast('Метаданные импортированы как начальное состояние', 'success');
            }
            refreshAllDisplays();
        } catch (error) {
            console.error('[Horae] Ошибка импорта:', error);
            showToast('Ошибка импорта: ' + error.message, 'error');
        }
    };
    input.click();
}

/**
 * Извлечь финальное накопленное состояние из файла экспорта, записать в chat[0] текущего диалога как начальные метаданные.
 * Подходит для наследования данных мира из предыдущего диалога.
 */
function _importAsInitialState(importObj, chat) {
    const allMetas = importObj.data
        .sort((a, b) => a.index - b.index)
        .map(d => d.horae_meta)
        .filter(Boolean);
    
    if (!allMetas.length) throw new Error('В файле экспорта нет действительных метаданных');
    if (!chat[0].horae_meta) chat[0].horae_meta = createEmptyMeta();
    const target = chat[0].horae_meta;
    
    // Накопление NPC
    for (const meta of allMetas) {
        if (meta.npcs) {
            for (const [name, info] of Object.entries(meta.npcs)) {
                if (!target.npcs) target.npcs = {};
                target.npcs[name] = { ...(target.npcs[name] || {}), ...info };
            }
        }
        if (meta.affection) {
            for (const [name, val] of Object.entries(meta.affection)) {
                if (!target.affection) target.affection = {};
                if (typeof val === 'object' && val.type === 'absolute') {
                    target.affection[name] = val.value;
                } else {
                    const num = typeof val === 'number' ? val : parseFloat(val) || 0;
                    target.affection[name] = (target.affection[name] || 0) + num;
                }
            }
        }
        if (meta.items) {
            if (!target.items) target.items = {};
            Object.assign(target.items, meta.items);
        }
        if (meta.costumes) {
            if (!target.costumes) target.costumes = {};
            Object.assign(target.costumes, meta.costumes);
        }
        if (meta.mood) {
            if (!target.mood) target.mood = {};
            Object.assign(target.mood, meta.mood);
        }
        if (meta.timestamp?.story_date) {
            target.timestamp.story_date = meta.timestamp.story_date;
        }
        if (meta.timestamp?.story_time) {
            target.timestamp.story_time = meta.timestamp.story_time;
        }
        if (meta.scene?.location) target.scene.location = meta.scene.location;
        if (meta.scene?.atmosphere) target.scene.atmosphere = meta.scene.atmosphere;
        if (meta.scene?.characters_present?.length) {
            target.scene.characters_present = [...meta.scene.characters_present];
        }
    }
    
    // Импортировать только ключевые+важные события
    const importedEvents = [];
    for (const meta of allMetas) {
        if (!meta.events?.length) continue;
        for (const evt of meta.events) {
            if (evt.level === '关键' || evt.level === '重要') {
                importedEvents.push({ ...evt });
            }
        }
    }
    if (importedEvents.length > 0) {
        if (!target.events) target.events = [];
        target.events.push(...importedEvents);
    }
    
    // Сеть отношений
    const finalRels = [];
    for (const meta of allMetas) {
        if (meta.relationships?.length) {
            for (const r of meta.relationships) {
                const existing = finalRels.find(e => e.source === r.source && e.target === r.target);
                if (existing) Object.assign(existing, r);
                else finalRels.push({ ...r });
            }
        }
    }
    if (finalRels.length > 0) target.relationships = finalRels;
    
    // RPG данные
    for (const meta of allMetas) {
        if (meta.rpg) {
            if (!target.rpg) target.rpg = { bars: {}, status: {}, skills: {}, attributes: {} };
            for (const sub of ['bars', 'status', 'skills', 'attributes']) {
                if (meta.rpg[sub]) Object.assign(target.rpg[sub], meta.rpg[sub]);
            }
        }
    }
    
    // Пользовательские таблицы
    for (const meta of allMetas) {
        if (meta.tableContributions) {
            if (!target.tableContributions) target.tableContributions = {};
            Object.assign(target.tableContributions, meta.tableContributions);
        }
    }
    
    // Память о локациях
    for (const meta of allMetas) {
        if (meta.locationMemory) {
            if (!target.locationMemory) target.locationMemory = {};
            Object.assign(target.locationMemory, meta.locationMemory);
        }
    }
    
    // Задачи
    const seenAgenda = new Set();
    for (const meta of allMetas) {
        if (meta.agenda?.length) {
            if (!target.agenda) target.agenda = [];
            for (const item of meta.agenda) {
                if (!seenAgenda.has(item.text)) {
                    target.agenda.push({ ...item });
                    seenAgenda.add(item.text);
                }
            }
        }
    }
    
    // Обработать удалённые предметы
    for (const meta of allMetas) {
        if (meta.deletedItems?.length) {
            for (const name of meta.deletedItems) {
                if (target.items?.[name]) delete target.items[name];
            }
        }
    }
    
    const npcCount = Object.keys(target.npcs || {}).length;
    const itemCount = Object.keys(target.items || {}).length;
    const eventCount = importedEvents.length;
    console.log(`[Horae] Импортировано начальное состояние: ${npcCount} NPC, ${itemCount} предметов, ${eventCount} ключевых/важных событий`);
}

/**
 * Очистить все данные
 */
async function clearAllData() {
    if (!confirm('Очистить все метаданные Horae? Это действие необратимо!')) {
        return;
    }
    
    const chat = horaeManager.getChat();
    for (const msg of chat) {
        delete msg.horae_meta;
    }
    
    await getContext().saveChat();
    showToast('Все данные очищены', 'warning');
    refreshAllDisplays();
}

/** Анализ содержимого сообщения с помощью ИИ */
async function analyzeMessageWithAI(messageContent) {
    const context = getContext();
    const userName = context?.name1 || 'Главный герой';

    let analysisPrompt;
    if (settings.customAnalysisPrompt) {
        analysisPrompt = settings.customAnalysisPrompt
            .replace(/\{\{user\}\}/gi, userName)
            .replace(/\{\{content\}\}/gi, messageContent);
    } else {
        analysisPrompt = getDefaultAnalysisPrompt()
            .replace(/\{\{user\}\}/gi, userName)
            .replace(/\{\{content\}\}/gi, messageContent);
    }

    try {
        const response = await context.generateRaw({ prompt: analysisPrompt });
        
        if (response) {
            const parsed = horaeManager.parseHoraeTag(response);
            return parsed;
        }
    } catch (error) {
        console.error('[Horae] Ошибка вызова ИИ-анализа:', error);
        throw error;
    }
    
    return null;
}

// ============================================
// Привязка событий
// ============================================

/**
 * Срабатывает при получении ответа ИИ
 */
async function onMessageReceived(messageId) {
    if (!settings.enabled || !settings.autoParse) return;
    _autoSummaryRanThisTurn = false;

    const chat = horaeManager.getChat();
    const message = chat[messageId];
    
    if (!message || message.is_user) return;
    
    // Пропустить обработку сообщений с меткой побочной сцены
    if (message.horae_meta?._skipHorae) return;
    
    // Определение regenerate/swipe: если meta уже есть — перегенерация, очистить старые данные
    const isRegenerate = !!(message.horae_meta?.timestamp?.absolute);
    let savedFlags = null;
    if (isRegenerate) {
        savedFlags = _saveCompressedFlags(message.horae_meta);
        message.horae_meta = createEmptyMeta();
    }
    
    const hasTag = horaeManager.processAIResponse(messageId, message.mes);
    
    if (isRegenerate) {
        _restoreCompressedFlags(message.horae_meta, savedFlags);
        horaeManager.rebuildTableData();
        horaeManager.rebuildRelationships();
        horaeManager.rebuildLocationMemory();
        horaeManager.rebuildRpgData();
    }
    
    await getContext().saveChat();
    refreshAllDisplays();
    renderCustomTablesList();
    
    setTimeout(() => {
        const messageEl = document.querySelector(`.mes[mesid="${messageId}"]`);
        if (messageEl) {
            const oldPanel = messageEl.querySelector('.horae-message-panel');
            if (oldPanel) oldPanel.remove();
            addMessagePanel(messageEl, messageId);
        }
    }, 100);

    if (settings.vectorEnabled && vectorManager.isReady) {
        const meta = horaeManager.getMessageMeta(messageId);
        if (meta) {
            vectorManager.addMessage(messageId, meta).then(() => {
                _updateVectorStatus();
            }).catch(err => console.warn('[Horae] Ошибка обновления векторного индекса:', err));
        }
    }

    // Последовательный запуск авто-сводки после ответа ИИ (пропустить, если параллельный путь уже выполнился)
    if (!isRegenerate && settings.autoSummaryEnabled && settings.sendTimeline) {
        setTimeout(() => {
            if (!_autoSummaryRanThisTurn) {
                checkAutoSummary();
            }
        }, 1500);
    }
}

/**
 * Срабатывает при удалении сообщения — пересборка данных таблиц
 */
function onMessageDeleted() {
    if (!settings.enabled) return;
    
    horaeManager.rebuildTableData();
    horaeManager.rebuildRelationships();
    horaeManager.rebuildLocationMemory();
    horaeManager.rebuildRpgData();
    getContext().saveChat();
    
    refreshAllDisplays();
    renderCustomTablesList();
}

/**
 * Срабатывает при редактировании сообщения — повторный разбор и пересборка таблиц
 */
function onMessageEdited(messageId) {
    if (!settings.enabled) return;
    
    const chat = horaeManager.getChat();
    const message = chat[messageId];
    if (!message || message.is_user) return;
    
    // Сохранить метку сжатия сводок, сбросить meta, после разбора восстановить
    const savedFlags = _saveCompressedFlags(message.horae_meta);
    message.horae_meta = createEmptyMeta();
    
    horaeManager.processAIResponse(messageId, message.mes);
    _restoreCompressedFlags(message.horae_meta, savedFlags);
    
    horaeManager.rebuildTableData();
    horaeManager.rebuildRelationships();
    horaeManager.rebuildLocationMemory();
    horaeManager.rebuildRpgData();
    getContext().saveChat();
    
    refreshAllDisplays();
    renderCustomTablesList();
    refreshVisiblePanels();

    if (settings.vectorEnabled && vectorManager.isReady) {
        const meta = horaeManager.getMessageMeta(messageId);
        if (meta) {
            vectorManager.addMessage(messageId, meta).catch(err =>
                console.warn('[Horae] Ошибка перестройки векторного индекса:', err));
        }
    }
}

/** Инжектировать контекст (данные + правила объединены) */
async function onPromptReady(eventData) {
    if (_isSummaryGeneration) return;
    if (!settings.enabled || !settings.injectContext) return;
    if (eventData.dryRun) return;
    
    try {
        // Определение swipe/regenerate
        let skipLast = 0;
        const chat = horaeManager.getChat();
        if (chat && chat.length > 0) {
            const lastMsg = chat[chat.length - 1];
            if (lastMsg && !lastMsg.is_user && lastMsg.horae_meta && (
                lastMsg.horae_meta.timestamp?.story_date ||
                lastMsg.horae_meta.scene?.location ||
                Object.keys(lastMsg.horae_meta.items || {}).length > 0 ||
                Object.keys(lastMsg.horae_meta.costumes || {}).length > 0 ||
                Object.keys(lastMsg.horae_meta.affection || {}).length > 0 ||
                Object.keys(lastMsg.horae_meta.npcs || {}).length > 0 ||
                (lastMsg.horae_meta.events || []).length > 0
            )) {
                skipLast = 1;
                console.log('[Horae] Обнаружен swipe/regenerate, пропустить старую память последнего сообщения');
            }
        }

        const dataPrompt = horaeManager.generateCompactPrompt(skipLast);

        let recallPrompt = '';
        console.log(`[Horae] Проверка векторов: vectorEnabled=${settings.vectorEnabled}, isReady=${vectorManager.isReady}, vectors=${vectorManager.vectors.size}`);
        if (settings.vectorEnabled && vectorManager.isReady) {
            try {
                recallPrompt = await vectorManager.generateRecallPrompt(horaeManager, skipLast, settings);
                console.log(`[Horae] Результат векторного извлечения: ${recallPrompt ? recallPrompt.length + ' символов' : 'пусто'}`);
            } catch (err) {
                console.error('[Horae] Ошибка векторного извлечения:', err);
            }
        }

        const rulesPrompt = horaeManager.generateSystemPromptAddition();

        let antiParaRef = '';
        if (settings.antiParaphraseMode && chat?.length) {
            for (let i = chat.length - 1; i >= 0; i--) {
                if (chat[i].is_user && chat[i].mes) {
                    const cleaned = chat[i].mes.replace(/<horae>[\s\S]*?<\/horae>/gi, '').replace(/<horaeevent>[\s\S]*?<\/horaeevent>/gi, '').trim();
                    if (cleaned) {
                        const truncated = cleaned.length > 2000 ? cleaned.slice(0, 2000) + '…' : cleaned;
                        antiParaRef = `\n[Режим без пересказа - предыдущее сообщение пользователя]\n${truncated}\n(Учти действия выше при расчёте текущего тега <horae>)`;
                    }
                    break;
                }
            }
        }

        const combinedPrompt = recallPrompt
            ? `${dataPrompt}\n${recallPrompt}${antiParaRef}\n${rulesPrompt}`
            : `${dataPrompt}${antiParaRef}\n${rulesPrompt}`;

        const position = settings.injectionPosition;
        if (position === 0) {
            eventData.chat.push({ role: 'system', content: combinedPrompt });
        } else {
            eventData.chat.splice(-position, 0, { role: 'system', content: combinedPrompt });
        }
        
        console.log(`[Horae] Контекст инжектирован, позиция: -${position}${skipLast ? ' (последнее сообщение пропущено)' : ''}${recallPrompt ? ' (включено векторное извлечение)' : ''}`);
    } catch (error) {
        console.error('[Horae] Ошибка инжекции контекста:', error);
    }
}

/**
 * Срабатывает при смене диалога
 */
async function onChatChanged() {
    if (!settings.enabled) return;
    
    clearTableHistory();
    horaeManager.init(getContext(), settings);
    
    refreshAllDisplays();
    renderCustomTablesList();
    renderDicePanel();

    if (settings.vectorEnabled && vectorManager.isReady) {
        const ctx = getContext();
        const chatId = ctx?.chatId || _deriveChatId(ctx);
        vectorManager.loadChat(chatId, horaeManager.getChat()).then(() => {
            _updateVectorStatus();
        }).catch(err => console.warn('[Horae] Ошибка загрузки векторного индекса:', err));
    }
    
    setTimeout(() => {
        document.querySelectorAll('.mes:not(.horae-processed)').forEach(messageEl => {
            const messageId = parseInt(messageEl.getAttribute('mesid'));
            if (!isNaN(messageId)) {
                const msg = horaeManager.getChat()[messageId];
                if (msg && !msg.is_user && msg.horae_meta) {
                    addMessagePanel(messageEl, messageId);
                }
                messageEl.classList.add('horae-processed');
            }
        });
    }, 500);
}

/** Срабатывает при рендеринге сообщения */
function onMessageRendered(messageId) {
    if (!settings.enabled || !settings.showMessagePanel) return;
    
    setTimeout(() => {
        const messageEl = document.querySelector(`.mes[mesid="${messageId}"]`);
        if (messageEl) {
            const msg = horaeManager.getChat()[messageId];
            if (msg && !msg.is_user) {
                addMessagePanel(messageEl, messageId);
                messageEl.classList.add('horae-processed');
            }
        }
    }, 100);
}

/** Срабатывает при переключении swipe — сброс meta, повторный разбор и обновление отображения */
function onSwipePanel(messageId) {
    if (!settings.enabled) return;
    
    setTimeout(() => {
        const msg = horaeManager.getChat()[messageId];
        if (!msg || msg.is_user) return;
        
        const savedFlags = _saveCompressedFlags(msg.horae_meta);
        msg.horae_meta = createEmptyMeta();
        horaeManager.processAIResponse(messageId, msg.mes);
        _restoreCompressedFlags(msg.horae_meta, savedFlags);
        
        horaeManager.rebuildTableData();
        horaeManager.rebuildRelationships();
        horaeManager.rebuildLocationMemory();
        horaeManager.rebuildRpgData();
        getContext().saveChat();
        
        refreshAllDisplays();
        renderCustomTablesList();
        
        if (settings.showMessagePanel) {
            const messageEl = document.querySelector(`.mes[mesid="${messageId}"]`);
            if (messageEl) {
                const oldPanel = messageEl.querySelector('.horae-message-panel');
                if (oldPanel) oldPanel.remove();
                addMessagePanel(messageEl, messageId);
            }
        }
    }, 150);
}

// ============================================
// Обучение для новых пользователей
// ============================================

const TUTORIAL_STEPS = [
    {
        title: 'Добро пожаловать в Horae — Хроники Времени!',
        content: `Это плагин, позволяющий ИИ автоматически отслеживать состояние сюжета.<br>
            Horae добавляет в ответы ИИ теги <code>&lt;horae&gt;</code>, автоматически записывая время, место, персонажей, предметы и другие изменения состояния.<br><br>
            Сейчас я кратко познакомлю тебя с основными функциями. Следуй подсказкам!`,
        target: null,
        action: null
    },
    {
        title: 'Обработка старых записей — ИИ-анализ',
        content: `Если у тебя есть старые записи чата, нужно сначала использовать «ИИ-анализ» для пакетного восстановления тегов <code>&lt;horae&gt;</code>.<br>
            ИИ перечитает историю диалога и создаст структурированные данные хронологии.<br><br>
            <strong>Для новых диалогов действий не требуется</strong> — плагин работает автоматически.`,
        target: '#horae-btn-ai-scan',
        action: null
    },
    {
        title: 'Авто-сводка и скрытие',
        content: `После включения старые сообщения, превысившие порог, будут автоматически сжаты в сводку и скрыты — экономит токены.<br><br>
            <strong>Внимание</strong>: функция требует наличия данных хронологии (теги <code>&lt;horae&gt;</code>) для корректной работы.<br>
            Старые записи нужно сначала обработать «ИИ-анализом» на предыдущем шаге.<br>
            · Если авто-сводка постоянно ошибается — выдели несколько событий в хронологии вручную и сделай полный текстовый анализ.`,
        target: '#horae-autosummary-collapse-toggle',
        action: () => {
            const body = document.getElementById('horae-autosummary-collapse-body');
            if (body && body.style.display === 'none') {
                document.getElementById('horae-autosummary-collapse-toggle')?.click();
            }
        }
    },
    {
        title: 'Векторная память (дополнение к авто-сводке)',
        content: `Это функция воспоминаний для <strong>пользователей авто-сводки</strong>. После сжатия сводок детали старых сообщений теряются. Векторная память автоматически извлекает из скрытой хронологии нужные фрагменты, когда диалог касается прошлых событий.<br><br>
            <strong>Нужно ли включать?</strong><br>
            · Если <strong>авто-сводка включена</strong> и история диалога большая → рекомендуется включить<br>
            · Если <strong>авто-сводка отключена</strong>, история небольшая, токенов достаточно → <strong>нет необходимости</strong><br><br>
            <strong>Выбор источника</strong>:<br>
            · <strong>Локальная модель</strong>: вычисления в браузере, <strong>не расходует API-квоту</strong>. При первом использовании загружается небольшая модель (~30-60 МБ).<br>
            ⚠️ <strong>Осторожно: OOM</strong>: локальная модель может вызвать <strong>зависание/белый экран/бесконечную загрузку</strong> при нехватке памяти. В таком случае переключись на режим API или уменьши количество записей в индексе.<br>
            · <strong>API</strong>: использует удалённую Embedding-модель (<strong>не</strong> ту LLM, что используется для чата). Embedding-модели — лёгкие специализированные векторные модели, <strong>расход минимален</strong>.<br>
            Рекомендуется бесплатная Embedding-модель от <strong>SiliconFlow</strong> (напр. BAAI/bge-m3) — доступна сразу после регистрации без дополнительной оплаты.<br><br>
            <strong>Полный текст</strong>: результаты с очень высоким совпадением отправляются в виде оригинального текста (цепочка рассуждений фильтруется автоматически), давая ИИ полный нарратив. «Количество полнотекстовых результатов» и «порог» настраиваются свободно; установи 0, чтобы отключить.`,
        target: '#horae-vector-collapse-toggle',
        action: () => {
            const body = document.getElementById('horae-vector-collapse-body');
            if (body && body.style.display === 'none') {
                document.getElementById('horae-vector-collapse-toggle')?.click();
            }
        }
    },
    {
        title: 'Глубина контекста',
        content: `Управляет диапазоном событий хронологии, отправляемых ИИ.<br><br>
            · Значение по умолчанию <strong>15</strong>: отправлять только «обычные» события из последних 15 сообщений<br>
            · <strong>«Важные» и «ключевые» события за пределами глубины всё равно отправляются</strong> — они не ограничены глубиной<br>
            · Значение 0: отправлять только «важные» и «ключевые» события<br><br>
            Обычно менять не нужно. Чем больше значение, тем больше информации и выше расход токенов.`,
        target: '#horae-setting-context-depth',
        action: null
    },
    {
        title: 'Позиция внедрения (глубина)',
        content: `Управляет тем, в какое место диалога вставляется информация о состоянии Horae.<br><br>
            · Значение по умолчанию <strong>1</strong>: вставлять после последнего сообщения (-1)<br>
            · Если в твоём пресете уже есть сводки, книга мира или <strong>аналогичные функции</strong>, они могут конфликтовать с форматом хронологии Horae и сбивать замены регулярных выражений<br>
            · При конфликте можно изменить это значение или <strong>отключить дублирующие функции в пресете</strong> (рекомендуется)<br><br>
            <strong>Совет</strong>: однотипные функции не нужно открывать одновременно — выбери одну.`,
        target: '#horae-setting-injection-position',
        action: null
    },
    {
        title: 'Пользовательские промпты',
        content: `Ты можешь настроить различные промпты для управления поведением ИИ:<br>
            · <strong>Системный промпт</strong> — правила вывода тегов <code>&lt;horae&gt;</code><br>
            · <strong>Промпт для ИИ-анализа</strong> — правила пакетного извлечения хронологии<br>
            · <strong>Промпт для ИИ-анализа (одиночный)</strong> — правила глубокого анализа отдельного сообщения<br>
            · <strong>Промпт для сжатия сюжета</strong> — правила компрессии сводок<br><br>
            Рекомендуется изменять после того, как освоишься с плагином. Оставь пустым для использования по умолчанию.`,
        target: '#horae-prompt-collapse-toggle',
        action: () => {
            const body = document.getElementById('horae-prompt-collapse-body');
            if (body && body.style.display === 'none') {
                document.getElementById('horae-prompt-collapse-toggle')?.click();
            }
        }
    },
    {
        title: 'Пользовательские таблицы',
        content: `Создавай таблицы в стиле Excel, в которые ИИ будет вносить нужную информацию (напр. таблица навыков, фракций).<br><br>
            <strong>Ключевые советы</strong>:<br>
            · Заголовки должны быть чёткими — ИИ понимает, что заполнять, по заголовкам<br>
            · «Промпт» для каждой таблицы должен быть конкретным — тогда ИИ будет заполнять правильно<br>
            · Некоторые модели (напр. бесплатный уровень Gemini) плохо распознают таблицы и могут заполнять некорректно`,
        target: '#horae-custom-tables-list',
        action: null
    },
    {
        title: 'Расширенное отслеживание',
        content: `Следующие функции отключены по умолчанию и предназначены для пользователей, стремящихся к детальному RP:<br><br>
            · <strong>Память о локациях</strong> — записывает постоянные физические характеристики мест для единообразных описаний<br>
            · <strong>Сеть отношений</strong> — отслеживает изменения отношений персонажей (друзья, влюблённые, враги и т.д.)<br>
            · <strong>Отслеживание эмоций</strong> — отслеживает изменения эмоционального/психологического состояния<br>
            · <strong>RPG-режим</strong> — включает полосы атрибутов (HP/MP/SP), многомерный радар, таблицу навыков и отслеживание состояний. Подходит для ролевых игр, фэнтези и подобных сцен. Подмодули включаются по необходимости; при отключении токены не расходуются<br><br>
            При необходимости включай в разделе «Отправляемые ИИ данные».`,
        target: '#horae-setting-send-location-memory',
        action: null
    },
    {
        title: 'Обучение завершено!',
        content: `Если ты начинаешь новый диалог, никаких дополнительных действий не нужно — плагин автоматически заставит ИИ добавлять теги в ответы и строить хронологию.<br><br>
            Если захочешь пройти обучение снова, найди кнопку «Начать обучение заново» в нижней части настроек.<br><br>
            Удачных ролевых игр! 🎉`,
        target: null,
        action: null
    }
];

async function startTutorial() {
    let drawerOpened = false;

    for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
        const step = TUTORIAL_STEPS[i];
        const isLast = i === TUTORIAL_STEPS.length - 1;

        // При первом шаге, требующем панели, открыть drawer и переключить на вкладку настроек
        if (step.target && !drawerOpened) {
            const drawerIcon = $('#horae_drawer_icon');
            if (drawerIcon.hasClass('closedIcon')) {
                drawerIcon.trigger('click');
                await new Promise(r => setTimeout(r, 400));
            }
            $(`.horae-tab[data-tab="settings"]`).trigger('click');
            await new Promise(r => setTimeout(r, 200));
            drawerOpened = true;
        }

        if (step.action) step.action();

        if (step.target) {
            await new Promise(r => setTimeout(r, 200));
            const targetEl = document.querySelector(step.target);
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        const continued = await showTutorialStep(step, i + 1, TUTORIAL_STEPS.length, isLast);
        if (!continued) break;
    }

    settings.tutorialCompleted = true;
    saveSettings();
}

function showTutorialStep(step, current, total, isLast) {
    return new Promise(resolve => {
        document.querySelectorAll('.horae-tutorial-card').forEach(e => e.remove());
        document.querySelectorAll('.horae-tutorial-highlight').forEach(e => e.classList.remove('horae-tutorial-highlight'));

        // Подсветить цель и определить точку вставки
        let highlightEl = null;
        let insertAfterEl = null;
        if (step.target) {
            const targetEl = document.querySelector(step.target);
            if (targetEl) {
                highlightEl = targetEl.closest('.horae-settings-section') || targetEl;
                highlightEl.classList.add('horae-tutorial-highlight');
                insertAfterEl = highlightEl;
            }
        }

        const card = document.createElement('div');
        card.className = 'horae-tutorial-card' + (isLightMode() ? ' horae-light' : '');
        card.innerHTML = `
            <div class="horae-tutorial-card-head">
                <span class="horae-tutorial-step-indicator">${current}/${total}</span>
                <strong>${step.title}</strong>
            </div>
            <div class="horae-tutorial-card-body">${step.content}</div>
            <div class="horae-tutorial-card-foot">
                <button class="horae-tutorial-skip">Пропустить</button>
                <button class="horae-tutorial-next">${isLast ? 'Готово ✓' : 'Далее →'}</button>
            </div>
        `;

        // Вставить сразу после целевой области; если нет цели — в начало страницы настроек
        if (insertAfterEl && insertAfterEl.parentNode) {
            insertAfterEl.parentNode.insertBefore(card, insertAfterEl.nextSibling);
        } else {
            const container = document.getElementById('horae-tab-settings') || document.getElementById('horae_drawer_content');
            if (container) {
                container.insertBefore(card, container.firstChild);
            } else {
                document.body.appendChild(card);
            }
        }

        // Автопрокрутка к подсвеченной цели (карточка обучения следует за ней, оба видны)
        const scrollTarget = highlightEl || card;
        setTimeout(() => scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

        const cleanup = () => {
            if (highlightEl) highlightEl.classList.remove('horae-tutorial-highlight');
            card.remove();
        };
        card.querySelector('.horae-tutorial-next').addEventListener('click', () => { cleanup(); resolve(true); });
        card.querySelector('.horae-tutorial-skip').addEventListener('click', () => { cleanup(); resolve(false); });
    });
}

// ============================================
// Инициализировать 
// ============================================

jQuery(async () => {
    console.log(`[Horae] Загрузка v${VERSION}...`);

    await initNavbarFunction();
    loadSettings();
    ensureRegexRules();

    $('#extensions-settings-button').after(await getTemplate('drawer'));

    // Инжектировать переключатель верхней иконки в панель расширений
    const extToggleHtml = `
        <div id="horae-ext-settings" class="inline-drawer" style="margin-top:4px;">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Horae Хроники Времени</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label" style="margin:6px 0;">
                    <input type="checkbox" id="horae-ext-show-top-icon" checked>
                    <span>Показывать иконку в верхней панели навигации</span>
                </label>
            </div>
        </div>
    `;
    $('#extensions_settings2').append(extToggleHtml);
    
    // Привязать переключатель иконки в панели расширений (переключение свёртывания управляется глобальным обработчиком SillyTavern)
    $('#horae-ext-show-top-icon').on('change', function() {
        settings.showTopIcon = this.checked;
        saveSettings();
        applyTopIconVisibility();
    });

    await initDrawer();
    initTabs();
    initSettingsEvents();
    syncSettingsToUI();
    
    horaeManager.init(getContext(), settings);
    
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onPromptReady);
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    eventSource.on(event_types.MESSAGE_RENDERED, onMessageRendered);
    eventSource.on(event_types.MESSAGE_SWIPED, onSwipePanel);
    eventSource.on(event_types.MESSAGE_DELETED, onMessageDeleted);
    eventSource.on(event_types.MESSAGE_EDITED, onMessageEdited);
    
    // Параллельная авто-сводка: запускается параллельно при отправке сообщения пользователем (независимый API через прямой HTTP, не влияет на основное подключение)
    if (event_types.USER_MESSAGE_RENDERED) {
        eventSource.on(event_types.USER_MESSAGE_RENDERED, () => {
            if (!settings.autoSummaryEnabled || !settings.sendTimeline) return;
            _autoSummaryRanThisTurn = true;
            checkAutoSummary().catch((e) => {
                console.warn('[Horae] Ошибка параллельной авто-сводки, повтор после ответа ИИ:', e);
                _autoSummaryRanThisTurn = false;
            });
        });
    }
    
    refreshAllDisplays();

    if (settings.vectorEnabled) {
        setTimeout(() => _initVectorModel(), 1000);
    }
    
    renderDicePanel();
    
    // Обучение для новых пользователей (только для тех, кто ещё ни разу не использовал Horae)
    if (_isFirstTimeUser) {
        setTimeout(() => startTutorial(), 800);
    }
    
    isInitialized = true;
    console.log(`[Horae] v${VERSION} загружен! Автор: SenriYuki`);
});
