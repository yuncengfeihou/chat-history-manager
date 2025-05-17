import {
    saveSettingsDebounced, // 本插件暂时未使用此函数，如果需要保存插件自身设置，则需要导入
    getCurrentChatId, // getContext() 提供了相关信息，通常更推荐
    eventSource, // 本插件暂时未使用事件监听，如果需要监听全局事件，则需要导入
    event_types, // 同上
    messageFormatting, // 本插件暂时未使用消息格式化
    getRequestHeaders, // 获取发送 API 请求所需的头部信息 (CSRF token)
    characters, // 全局角色数组
    openCharacterChat, // 打开指定角色的聊天文件
    saveChatConditional // 有条件地保存当前聊天 (用于恢复前保存当前聊天)
} from '../../../../script.js';

import {
    // --- 群组相关函数 ---
    select_group_chats,     // 用于选择群组聊天
    selected_group, // 当前选中的群组 ID
    // getGroupChat, // 可能不需要，select_group_chats 应该会处理
    select_group_chats as selectGroupChatFile, // 选择并加载指定的群组聊天文件
} from '../../../group-chats.js';

// 导入从 extensions.js 提供的辅助函数和变量
// 路径: '../../../extensions.js' (从 public/extensions/third-party/你的插件名/index.js 到 public/extensions.js 的相对路径)
import {
    getContext, // 获取当前的聊天上下文 (角色/群组)
    renderExtensionTemplateAsync, // 用于加载插件目录下的 HTML 模板
    // extension_settings, // 本插件暂时未使用插件自身设置，如果需要存储插件的配置，则需要导入
} from '../../../extensions.js';

// 导入从 popup.js 提供的弹窗工具
// 路径: '../../../popup.js' (从 public/extensions/third-party/你的插件名/index.js 到 public/popup.js 的相对路径)
import {
    Popup, // 弹窗类
    POPUP_TYPE, // 弹窗类型枚举
    callGenericPopup, // 调用通用弹窗的便捷函数
    POPUP_RESULT, // 弹窗结果枚举
} from '../../../popup.js';

// 导入从 utils.js 提供的通用工具函数
// 路径: '../../../utils.js' (从 public/extensions/third-party/你的插件名/index.js 到 public/utils.js 的相对路径)
import {
    // uuidv4, // 本插件暂时未使用 uuidv4
    timestampToMoment, // 将时间戳转换为 Moment.js 对象
} from '../../../utils.js'

// 插件文件夹名称
const pluginFolderName = 'chat-history-manager';

// 插件的唯一 ID (与 manifest.json 中的 id 对应，但这里只用于日志和内部识别)
const pluginId = 'chat-backup-manager-ui';

// 备份管理器弹窗实例（用于后续关闭操作）
let backupManagerPopup = null;

// --- UI 注入 ---

// 这是插件的主入口点，所有需要操作 DOM 的代码都应该放在 jQuery(async () => { ... }); 里面
jQuery(async () => {
    console.log(`[${pluginId}] DOM 已加载，开始注入 UI 元素。`);

    const $optionsMenu = $('#options');
    if ($optionsMenu.length) {
        const $backupButton = $(`
            <div id="option_manage_backups" class="menu_button">
                <span>管理备份</span>
            </div>
        `);

        const $selectChatButton = $('#option_select_chat');
        if ($selectChatButton.length) {
             $backupButton.insertAfter($selectChatButton);
             console.log(`[${pluginId}] 已将“管理备份”按钮注入到 Options 菜单。`);
        } else {
            $optionsMenu.append($backupButton);
             console.log(`[${pluginId}] 已将“管理备份”按钮追加到 Options 菜单。`);
        }

         console.log(`[${pluginId}] “管理备份”按钮已创建，等待 APP_READY 事件绑定点击处理。`);
    } else {
        console.warn(`[${pluginId}] 未找到 Options 菜单容器 (#options)，无法注入按钮。`);
    }
});

// --- 等待 APP_READY 事件并绑定需要核心功能依赖的事件 ---

eventSource.on(event_types.APP_READY, async () => {
    console.log(`[${pluginId}] 收到 APP_READY 事件，SillyTavern 核心功能已准备就绪。`);

    const $backupButton = $('#option_manage_backups');

    if ($backupButton.length) {
        $backupButton.on('click', async () => {
            await openBackupManagerPopup();
            $('#options').hide();
        });
        console.log(`[${pluginId}] 已为“管理备份”按钮绑定点击处理。`);
    } else {
         console.warn(`[${pluginId}] 未找到“管理备份”按钮 (#option_manage_backups)，无法绑定点击处理。`);
    }

     $(document).on('click', '.chat-backup-manager-popup .restore-backup-button', async function() {
        const filename = $(this).data('filename');
        if (filename) {
            console.log(`[${pluginId}] 用户点击恢复备份: ${filename}`);
            await restoreBackup(filename);
        } else {
            console.warn(`[${pluginId}] 恢复按钮缺少文件名数据。`);
        }
    });
     console.log(`[${pluginId}] 已为弹窗内部按钮设置事件委托。`);
});


// --- 插件功能函数 ---

/**
 * 打开聊天备份管理弹窗
 */
async function openBackupManagerPopup() {
    console.log(`[${pluginId}] 打开备份管理器弹窗...`);

    // 获取当前的上下文（角色或群组）
    const context = getContext();
    const currentEntityId = context.characterId !== undefined ? context.characterId : context.selected_group;
    const isGroup = context.selected_group !== undefined; // <-- 在这里定义 isGroup

    // 加载弹窗的 HTML 模板
    try {
        const popupHtml = await renderExtensionTemplateAsync(`third-party/${pluginFolderName}`, 'backup_manager_popup');

        // 使用 Popup 类创建并显示弹窗
        backupManagerPopup = new Popup($(popupHtml), POPUP_TYPE.TEXT, null, {
            wide: true, large: true, allowVerticalScrolling: true,
            onClose: () => backupManagerPopup = null
        });

        // 设置弹窗标题
        const entityName = isGroup ? groups.find(g => g.id === selected_group)?.name : characters[context.characterId]?.name;
        const title = '备份文件' + (entityName ? ` - ${entityName}` : '');
        backupManagerPopup.dlg.querySelector('#backup-manager-title').textContent = title;


        // 获取备份文件列表并填充到弹窗中
        if (currentEntityId === undefined) {
            console.log(`[${pluginId}] 未选中角色或群组，无法显示备份。`);
            backupManagerPopup.dlg.querySelector('#backup-list-container').style.display = 'none';
            backupManagerPopup.dlg.querySelector('#no-entity-selected-message').style.display = 'block';
            backupManagerPopup.dlg.querySelector('#no-entity-selected-message p').textContent = '请先选择一个角色或群组来管理其聊天备份。';

        } else {
            backupManagerPopup.dlg.querySelector('#backup-list-container').style.display = 'block';
            backupManagerPopup.dlg.querySelector('#no-entity-selected-message').style.display = 'none';
            // !!! 修改这里：将 isGroup 作为参数传递 !!!
            await fetchAndDisplayBackups(context, backupManagerPopup.dlg.querySelector('#backup-list-container'), isGroup);
        }


        await backupManagerPopup.show();

    } catch (error) {
        console.error(`[${pluginId}] 打开备份管理器弹窗失败:`, error);
        callGenericPopup('无法加载备份管理器界面。', POPUP_TYPE.TEXT, null, { text: error.message });
    }
}

/**
 * 从后端获取聊天备份文件列表并填充到指定的 HTML 容器中
 * @param {object} context - 当前 SillyTavern 上下文 (包含 characterId 或 selected_group)
 * @param {HTMLElement} container - 用于显示备份列表的 HTML 容器元素
 * @param {boolean} isGroup - 指示当前上下文是否为群组
 */
// !!! 修改这里：添加 isGroup 参数 !!!
async function fetchAndDisplayBackups(context, container, isGroup) {
    console.log(`[${pluginId}] 正在获取备份文件列表...`);
    $(container).empty();

    try {
        const requestBody = {
            query: '',
            avatar_url: context.characterId !== undefined ? characters[context.characterId]?.avatar : null,
            group_id: context.selected_group !== undefined ? context.selected_group : null,
        };

        const response = await fetch('/api/chats/search', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            throw new Error(`HTTP 错误! 状态: ${response.status}`);
        }

        const backups = await response.json();
        console.log(`[${pluginId}] 获取到 ${backups.length} 个备份文件。`);

        backups.sort((a, b) => {
            const momentA = timestampToMoment(a.last_mes);
            const momentB = timestampToMoment(b.last_mes);
            if (momentA.isValid() && momentB.isValid()) {
                 if (momentA.isBefore(momentB)) return 1;
                 if (momentA.isAfter(momentB)) return -1;
                 return 0;
            }
            if (momentA.isValid()) return -1;
            if (momentB.isValid()) return 1;
            return 0;
        });


        const currentChatFilename = context.selected_group
            ? groups.find(g => g.id === context.selected_group)?.chat_id
            : characters[context.characterId]?.chat;
        // 根据是否是群组，决定当前文件名的格式（带或不带 .jsonl）
        const currentChatFilenameFormatted = isGroup ? `${currentChatFilename}.jsonl` : `${currentChatFilename}.jsonl`;


        if (backups.length === 0) {
            const noBackupsMessage = '没有找到备份文件。';
            $(container).html(`<div class="no-entity-selected"><p>${noBackupsMessage}</p></div>`);
        } else {
            backups.forEach(backup => {
                const lastMesTime = timestampToMoment(backup.last_mes).format('YYYY-MM-DD HH:mm');

                const $backupItem = $(`
                    <div class="backup-item">
                        <div class="backup-info">
                            <div class="filename">${backup.file_name}</div>
                            <div class="meta">
                                最后更新: ${lastMesTime}, 消息数: ${backup.message_count}
                            </div>
                            <div class="meta preview">${backup.preview_message ? '预览' + ': ' + backup.preview_message : ''}</div>
                        </div>
                        <div class="backup-actions">
                            <button class="menu_button restore-backup-button" data-filename="${backup.file_name}">恢复</button>
                        </div>
                    </div>
                `);

                if (backup.file_name === currentChatFilenameFormatted) {
                    $backupItem.addClass('is-current');
                }


                $(container).append($backupItem);
            });
        }


    } catch (error) {
        console.error(`[${pluginId}] 获取或显示备份文件列表失败:`, error);
        const errorMessage = '无法加载备份文件列表。';
        $(container).html(`<div class="no-entity-selected"><p>${errorMessage}</p><p>${error.message}</p></div>`);

    }
}

/**
 * 恢复指定的聊天备份文件
 * @param {string} filename - 要恢复的备份文件名称 (包含 .jsonl 后缀)
 */
async function restoreBackup(filename) {
    console.log(`[${pluginId}] 尝试恢复备份: ${filename}`);

    const confirmSave = await callGenericPopup(
        '您确定要恢复备份吗？当前聊天中未保存的修改将会丢失。',
        POPUP_TYPE.CONFIRM,
        null,
        {
            okButton: '恢复并保存当前',
            cancelButton: '取消',
            customButtons: [{ text: '恢复不保存', result: 2 }],
            defaultResult: POPUP_RESULT.AFFIRMATIVE
        }
    );

    if (confirmSave === POPUP_RESULT.CANCELLED) {
        console.log(`[${pluginId}] 用户取消恢复操作。`);
        return;
    }

    if (confirmSave === POPUP_RESULT.AFFIRMATIVE) {
        console.log(`[${pluginId}] 用户选择保存当前聊天。`);
        await saveChatConditional();
    } else if (confirmSave === 2) {
        console.log(`[${pluginId}] 用户选择不保存当前聊天。`);
    } else {
         console.warn(`[${pluginId}] 收到未知的确认结果: ${confirmSave}`);
         return;
    }

    try {
        const context = getContext();
        const isGroup = context.selected_group !== undefined;

        const chatFileNameWithoutExtension = filename.replace('.jsonl', '');

        if (isGroup) {
            const groupId = context.selected_group;
            console.log(`[${pluginId}] 正在加载群组 ${groupId} 的聊天文件: ${chatFileNameWithoutExtension}`);
            await selectGroupChatFile(groupId, chatFileNameWithoutExtension);

        } else if (context.characterId !== undefined) {
             console.log(`[${pluginId}] 正在加载角色 ${characters[context.characterId]?.name} 的聊天文件: ${chatFileNameWithoutExtension}`);
            await openCharacterChat(chatFileNameWithoutExtension);

        } else {
            console.error(`[${pluginId}] 无法确定是角色还是群组上下文。`);
             callGenericPopup('无法确定当前上下文，恢复失败。', POPUP_TYPE.TEXT);
             return;
        }


        if (backupManagerPopup) {
            backupManagerPopup.dlg.close();
        }

        toastr.success('聊天备份已恢复！', '恢复成功');
        console.log(`[${pluginId}] 备份文件 ${filename} 恢复成功。`);

    } catch (error) {
        console.error(`[${pluginId}] 恢复备份 ${filename} 失败:`, error);
        callGenericPopup('恢复聊天备份失败。', POPUP_TYPE.TEXT, null, { text: error.message });
    }
}
