/**
 * Chat History Manager Frontend Plugin
 * Allows viewing and restoring past chat files for the selected character or group.
 */

import { renderExtensionTemplateAsync } from '../../../extensions.js';

// 获取插件 ID (从 manifest.json 读取，或者直接在这里定义，推荐定义)
const pluginId = 'chat-history-manager';

// 插件初始化入口，确保在 DOM 加载完成后执行
// 这个函数是 SillyTavern 为插件提供的，可以在这里安全地操作 DOM
jQuery(async () => {
    console.log(`[${pluginId}] Plugin loaded.`);

    // --- 1. 获取 HTML 模板元素 ---
    // SillyTavern 加载插件 HTML 文件后，会将其内容添加到 DOM 中。
    // 我们直接通过 ID 来获取弹窗的顶层元素。
    const $popup = $('#chat-history-manager-popup');

    // 检查弹窗元素是否存在，确保 HTML 文件被正确加载
    if ($popup.length === 0) {
        console.error(`[${pluginId}] Popup HTML element (#chat-history-manager-popup) not found in DOM. Ensure popup.html is declared in manifest.json.`);
        // 可以添加一个用户可见的错误提示
        // toastr.error(t`Plugin "${pluginId}" failed to initialize: Popup element not found.`);
        return; // 停止插件初始化
    }

    // 获取弹窗内部的关键元素
    const $chatListContainer = $popup.find('#history-chat-list');
    const $chatItemTemplate = $chatListContainer.find('.chat-item-template');
    const $emptyMessage = $chatListContainer.find('#history-list-empty-message');
    const $popupAvatar = $popup.find('#history-popup-avatar');
    const $popupName = $popup.find('#history-popup-name');
    const $closeButton = $popup.find('#history-manager-close');

    // --- 2. 在 Options 菜单中添加一个按钮 ---
    // 找到 Options 菜单的列表
    const $optionsMenu = $('#options_list'); // Options 菜单通常使用这个 ID
    if ($optionsMenu.length) {
        // 创建新的菜单项
        const $newMenuItem = $('<li>')
            .addClass('list_item')
            .html('<button class="menu_button" id="open-chat-history-button">历史聊天</button>'); // 注意 ID

        // 将新菜单项添加到 Options 列表中
        $optionsMenu.append($newMenuItem);
        console.log(`[${pluginId}] Added button to Options menu.`);

        // --- 3. 为新按钮绑定点击事件 ---
        $('#open-chat-history-button').on('click', async () => {
            // 获取当前的 SillyTavern 上下文
            const context = getContext(); // getContext 是 SillyTavern 暴露给插件的全局函数

            // 检查是否有角色或群组被选中
            // getContext().characterId 是当前角色在 characters 数组中的索引 (字符串或 undefined)
            // getContext().selected_group 是当前群组的 ID (字符串或 null)
            const characterId = context.characterId !== undefined ? Number(context.characterId) : undefined;
            const groupId = context.selected_group;


            if (characterId === undefined && groupId === null) { // 注意这里应检查是否为 null
                toastr.info(t`Please select a character or group first.`); // 使用 SillyTavern 的国际化函数 t()
                return;
            }

            // 清空列表和错误信息 (保留模板)
            $chatListContainer.find('.chat-item').remove();
            $emptyMessage.hide();
            $popupAvatar.attr('src', '');
            $popupName.text('');

            // 根据是角色还是群组，获取对应的名称和头像 URL
            let avatarUrl = '';
            let displayName = '';
            let isGroup = false;

            if (groupId !== null) { // 是群组
                isGroup = true;
                const group = context.groups.find(g => g.id === groupId);
                if (group) {
                    displayName = group.name;
                    // 群组头像 URL 在 group 对象中
                    avatarUrl = group.avatar_url;
                    if (!avatarUrl) {
                         // 如果群组没有设置头像，可以使用一个默认图标
                         avatarUrl = system_avatar; // system_avatar 是 SillyTavern 暴露的全局变量
                    }
                     $popupAvatar.attr('src', avatarUrl);
                     $popupName.text(`群组: ${displayName}`); // 显示群组类型
                } else {
                     toastr.error(t`Could not find group data.`);
                     return; // 找不到群组数据，退出
                }
            } else { // 是角色
                // characterId 是索引，确保它在 characters 数组范围内
                const character = context.characters[characterId];
                 if (character) {
                    displayName = character.name;
                    // getThumbnailUrl 是 SillyTavern 暴露的全局函数
                    avatarUrl = character.avatar !== 'none' ? getThumbnailUrl('avatar', character.avatar) : default_avatar; // default_avatar 是 SillyTavern 暴露的全局变量
                    $popupAvatar.attr('src', avatarUrl);
                    $popupName.text(`角色: ${displayName}`); // 显示角色类型
                } else {
                     toastr.error(t`Could not find character data.`);
                     return; // 找不到角色数据，退出
                }
            }


            // 显示加载提示
            showLoader(); // showLoader 是 SillyTavern 暴露的全局函数

            try {
                // --- 4. 调用 API 获取历史聊天列表 ---
                const searchApiEndpoint = '/api/chats/search';
                const requestBody = {
                    query: '', // 空查询，获取所有历史聊天
                    // API 需要角色头像 URL 或群组 ID
                    avatar_url: isGroup ? null : avatarUrl,
                    group_id: isGroup ? groupId : null,
                };

                // getRequestHeaders 是 SillyTavern 暴露的全局函数，用于获取包含 CSRF Token 的请求头
                const response = await fetch(searchApiEndpoint, {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify(requestBody),
                });

                if (!response.ok) {
                    // 尝试解析错误响应体
                     const errorData = await response.json().catch(() => ({ message: response.statusText }));
                    throw new Error(`Failed to fetch chat list: ${response.status} ${errorData.message || 'Unknown Error'}`);
                }

                const chatList = await response.json(); // API 返回的是过滤后的聊天列表数组
                 console.log(`[${pluginId}] Fetched ${chatList.length} historical chats.`);
                 console.log(chatList);


                // --- 5. 填充弹窗列表 ---
                if (chatList.length === 0) {
                    $emptyMessage.show();
                } else {
                    // 按照最后消息日期降序排序
                    // timestampToMoment 是 SillyTavern 暴露的全局函数
                    chatList.sort((a, b) => timestampToMoment(b.last_mes).valueOf() - timestampToMoment(a.last_mes).valueOf());

                    chatList.forEach(chatInfo => {
                        // 克隆模板
                        const $chatItem = $chatItemTemplate.clone().removeClass('chat-item-template').addClass('chat-item').show();

                        // 填充信息
                        $chatItem.find('.chat-file-name').text(chatInfo.file_name).attr('title', chatInfo.file_name);
                        $chatItem.find('.chat-message-count').text(`${chatInfo.message_count} 💬`);
                        $chatItem.find('.chat-last-message').text(chatInfo.preview_message || '无预览消息').attr('title', chatInfo.preview_message || ''); // 添加一个默认空字符串以避免 undefined
                        // timestampToMoment 是 SillyTavern 暴露的全局函数
                        $chatItem.find('.chat-last-date').text(timestampToMoment(chatInfo.last_mes).isValid() ? timestampToMoment(chatInfo.last_mes).format('YYYY-MM-DD HH:mm') : '未知日期');

                        // 为恢复按钮设置数据属性，存储文件名
                        $chatItem.find('.restore-chat-button').data('filename', chatInfo.file_name);

                        // 添加到列表中
                        $chatListContainer.append($chatItem);
                    });
                }

                // --- 6. 显示弹窗 ---
                 // 使用 SillyTavern 的 Popup 类显示弹窗
                 // 直接将 jQuery 对象传入 Popup.show()
                Popup.show($popup, POPUP_TYPE.TEXT, '', { wide: true, large: true, allowVerticalScrolling: true, disableBackgroundClose: false });


            } catch (error) {
                console.error(`[${pluginId}] Error fetching chat list:`, error);
                toastr.error(t`Failed to load chat history. ${error.message || ''}`); // 显示错误信息
            } finally {
                // 隐藏加载提示
                hideLoader(); // hideLoader 是 SillyTavern 暴露的全局函数
            }
        });
    } else {
        console.error(`[${pluginId}] Options menu element (#options_list) not found.`);
        // 也可以添加一个用户可见的错误提示
        // toastr.error(t`Plugin "${pluginId}" failed to initialize: Options menu not found.`);
    }

    // --- 7. 为“恢复”按钮绑定事件 (使用事件委托) ---
    // 将事件监听器绑定到列表容器上，因为聊天项是动态生成的
    $chatListContainer.on('click', '.restore-chat-button', async function() {
        const $button = $(this);
        const filename = $button.data('filename'); // 获取存储的文件名

        if (!filename) {
            console.warn(`[${pluginId}] Restore button clicked, but no filename data found.`);
            toastr.warning(t`No filename associated with this item.`);
            return;
        }

        // 提示用户确认恢复
        const confirmRestore = await Popup.show.confirm(t`Confirm Restore`, t`Are you sure you want to restore chat "${filename}"? Any unsaved changes in the current chat may be lost.`);

        if (!confirmRestore) {
            return; // 用户取消操作
        }

        // 恢复聊天
        showLoader(); // 显示加载提示
        try {
            const context = getContext();
            const characterId = context.characterId !== undefined ? Number(context.characterId) : undefined;
            const groupId = context.selected_group;
            const cleanFilename = filename.replace('.jsonl', ''); // 移除扩展名

            // 根据是角色还是群组调用不同的核心函数
            if (groupId !== null) { // 恢复群组聊天
                 console.log(`[${pluginId}] Attempting to restore group chat ${cleanFilename} for group ${groupId}`);
                 // getGroupChat(groupId, true, cleanFilename) 用于加载指定的群组聊天文件到内存
                 // 第一个参数是群组 ID，第二个 true 表示这是在加载历史聊天（不是创建新的）
                 // 第三个参数是需要加载的聊天文件名（不带扩展名）
                 // 它返回加载是否成功的布尔值
                 const success = await getGroupChat(groupId, true, cleanFilename);

                 if(success === false) { // getGroupChat 在加载失败时返回 false
                     throw new Error('Failed to load group chat file.');
                 }

                 // getGroupChat 成功加载到内存后，我们还需要手动刷新 UI 和保存状态
                 await clearChat(); // 清空当前 UI 显示，clearChat 是全局函数
                 await printMessages(); // 根据新的 chat 数组重新渲染 UI，printMessages 是全局函数
                 // 更新群组的当前聊天文件到恢复的这个文件，以便下次加载是它
                 // context.groups 包含所有群组的列表
                 const groupToUpdate = context.groups.find(g => g.id === groupId);
                 if(groupToUpdate) {
                    groupToUpdate.chat_id = cleanFilename; // 更新群组对象中的当前聊天文件名
                    await saveGroupChat(groupId, true); // 保存群组设置，saveGroupChat 是全局函数
                 } else {
                     console.warn(`[${pluginId}] Restored chat ${cleanFilename}, but could not find group object to update chat_id.`);
                 }


            } else if (characterId !== undefined) { // 恢复角色聊天
                 console.log(`[${pluginId}] Attempting to restore character chat ${cleanFilename} for character index ${characterId}`);
                // openCharacterChat(filenameWithoutExtension) 是 SillyTavern 核心函数，
                // 它会负责加载指定的聊天文件到内存，清空当前 UI，更新角色对象的 chat 属性，
                // 重新渲染 UI，并触发保存设置。对于角色聊天，这是最便捷的方式。
                await openCharacterChat(cleanFilename); // openCharacterChat 是全局函数

            } else {
                // 这个分支理论上不应该被走到，因为前面已经检查了
                throw new Error('No character or group selected for restoration.');
            }

            // 如果上面的加载/恢复函数成功，则显示成功提示
            toastr.success(t`Chat "${filename}" restored successfully.`); // toastr 是全局库
            // 恢复成功后，关闭弹窗
            Popup.close(); // Popup 是全局类

        } catch (error) {
            console.error(`[${pluginId}] Error restoring chat:`, error);
            toastr.error(t`Failed to restore chat "${filename}". ${error.message || ''}`); // 显示错误信息
        } finally {
            // 隐藏加载提示
            hideLoader(); // hideLoader 是全局函数
        }
    });

    // --- 8. 为“关闭”按钮绑定点击事件 ---
    $closeButton.on('click', () => {
        Popup.close(); // 关闭弹窗
    });


    console.log(`[${pluginId}] Plugin initialized successfully.`);
});
