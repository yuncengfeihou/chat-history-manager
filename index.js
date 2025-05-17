/**
 * Chat History Manager Frontend Plugin
 * Allows viewing and restoring past chat files for the selected character or group.
 */

// 获取插件 ID (从 manifest.json 读取，或者直接在这里定义，推荐定义)
const pluginId = 'chat-history-manager';

// 插件初始化入口，确保在 DOM 加载完成后执行
jQuery(async () => {
    console.log(`[${pluginId}] Plugin loaded.`);

    // --- 1. 加载 HTML 模板 ---
    // SillyTavern 核心函数，用于加载插件的 HTML 模板文件
    const popupTemplateHTML = await renderTemplateAsync(`third-party/${pluginId}`, 'popup');
    // 将模板添加到 DOM 中，但默认隐藏
    $('body').append($(popupTemplateHTML).hide());

    // 获取弹窗元素及其内部关键元素
    const $popup = $('#chat-history-manager-popup');
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
            const context = getContext();
            const characterId = context.characterId; // 当前选中的角色索引
            const groupId = context.selected_group; // 当前选中的群组 ID

            // 检查是否有角色或群组被选中
            if (characterId === undefined && groupId === undefined) {
                toastr.info(t`Please select a character or group first.`); // 使用 SillyTavern 的国际化函数 t()
                return;
            }

            // 清空列表和错误信息
            $chatListContainer.find('.chat-item:not(.chat-item-template)').remove();
            $emptyMessage.hide();
            $popupAvatar.attr('src', '');
            $popupName.text('');

            // 根据是角色还是群组，获取对应的名称和头像 URL
            let avatarUrl = '';
            let displayName = '';
            let isGroup = false;

            if (groupId !== undefined) {
                isGroup = true;
                const group = context.groups.find(g => g.id === groupId);
                if (group) {
                    displayName = group.name;
                    avatarUrl = group.avatar_url; // 群组可能也有头像 URL
                    if (!avatarUrl) {
                         avatarUrl = system_avatar; // 使用系统默认头像如果群组没有
                    }
                     $popupAvatar.attr('src', avatarUrl);
                     $popupName.text(`群组: ${displayName}`);
                } else {
                     toastr.error(t`Could not find group data.`);
                     return;
                }
            } else { // 角色
                const character = context.characters[characterId];
                 if (character) {
                    displayName = character.name;
                    avatarUrl = character.avatar !== 'none' ? getThumbnailUrl('avatar', character.avatar) : default_avatar;
                    $popupAvatar.attr('src', avatarUrl);
                    $popupName.text(`角色: ${displayName}`);
                } else {
                     toastr.error(t`Could not find character data.`);
                     return;
                }
            }


            // 显示加载提示
            showLoader();

            try {
                // --- 4. 调用 API 获取历史聊天列表 ---
                const searchApiEndpoint = '/api/chats/search';
                const requestBody = {
                    query: '', // 空查询，获取所有历史聊天
                    avatar_url: isGroup ? null : avatarUrl, // 角色头像
                    group_id: isGroup ? groupId : null, // 群组 ID
                };

                const response = await fetch(searchApiEndpoint, {
                    method: 'POST',
                    headers: getRequestHeaders(), // 获取 SillyTavern 的请求头 (包含 CSRF Token)
                    body: JSON.stringify(requestBody),
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch chat list: ${response.status} ${response.statusText}`);
                }

                const chatList = await response.json(); // API 返回的是过滤后的聊天列表数组
                 console.log(`[${pluginId}] Fetched ${chatList.length} historical chats.`);
                 console.log(chatList);


                // --- 5. 填充弹窗列表 ---
                if (chatList.length === 0) {
                    $emptyMessage.show();
                } else {
                    // 按照最后消息日期降序排序 (可以根据需要调整排序逻辑)
                    chatList.sort((a, b) => timestampToMoment(b.last_mes).valueOf() - timestampToMoment(a.last_mes).valueOf());

                    chatList.forEach(chatInfo => {
                        // 克隆模板
                        const $chatItem = $chatItemTemplate.clone().removeClass('chat-item-template').addClass('chat-item').show();

                        // 填充信息
                        $chatItem.find('.chat-file-name').text(chatInfo.file_name).attr('title', chatInfo.file_name);
                        $chatItem.find('.chat-message-count').text(`${chatInfo.message_count} 💬`);
                        $chatItem.find('.chat-last-message').text(chatInfo.preview_message || '无预览消息').attr('title', chatInfo.preview_message);
                        $chatItem.find('.chat-last-date').text(timestampToMoment(chatInfo.last_mes).isValid() ? timestampToMoment(chatInfo.last_mes).format('YYYY-MM-DD HH:mm') : '未知日期');

                        // 为恢复按钮设置数据属性，存储文件名
                        $chatItem.find('.restore-chat-button').data('filename', chatInfo.file_name);

                        // 添加到列表中
                        $chatListContainer.append($chatItem);
                    });
                }

                // --- 6. 显示弹窗 ---
                 // 使用 SillyTavern 的 Popup 类显示弹窗
                 // 我们使用了上面加载的 popupTemplateHTML 作为弹窗的内容
                Popup.show($popup, POPUP_TYPE.TEXT, '', { wide: true, large: true, allowVerticalScrolling: true, disableBackgroundClose: false });


            } catch (error) {
                console.error(`[${pluginId}] Error fetching chat list:`, error);
                toastr.error(t`Failed to load chat history.`);
            } finally {
                // 隐藏加载提示
                hideLoader();
            }
        });
    } else {
        console.error(`[${pluginId}] Options menu element (#options_list) not found.`);
    }

    // --- 7. 为“恢复”按钮绑定事件 (使用事件委托) ---
    // 将事件监听器绑定到列表容器上，因为聊天项是动态生成的
    $chatListContainer.on('click', '.restore-chat-button', async function() {
        const $button = $(this);
        const filename = $button.data('filename'); // 获取存储的文件名

        if (!filename) {
            console.warn(`[${pluginId}] Restore button clicked, but no filename data found.`);
            return;
        }

        // 提示用户确认恢复
        const confirmRestore = await Popup.show.confirm(t`Confirm Restore`, t`Are you sure you want to restore chat "${filename}"? Any unsaved changes in the current chat may be lost.`);

        if (!confirmRestore) {
            return; // 用户取消操作
        }

        // 恢复聊天
        showLoader();
        try {
            const context = getContext();
            const characterId = context.characterId;
            const groupId = context.selected_group;
            const cleanFilename = filename.replace('.jsonl', ''); // 移除扩展名

            if (groupId !== undefined) { // 恢复群组聊天
                 console.log(`[${pluginId}] Restoring group chat ${cleanFilename} for group ${groupId}`);
                 // getGroupChat(groupId, true, filename) 会加载指定的群组聊天文件
                 // 但是它不会像 openCharacterChat 那样更新 UI 和内部状态
                 // 更可靠的方式是模拟用户在 Manage Chat Files 中点击加载
                 // 然而，直接调用内部加载函数更直接。
                 // 让我们调用 getGroupChat 并希望它能正确更新内部 chat 数组
                 // 然后手动触发 UI 刷新和状态保存
                 const success = await getGroupChat(groupId, true, cleanFilename);

                 if(success === false) { // getGroupChat 在加载失败时返回 false
                     throw new Error('Failed to load group chat file.');
                 }

                 // 虽然 getGroupChat 可能会更新 chat 数组，但它不刷新 UI 也不保存设置
                 // 强制清空 UI
                 await clearChat();
                 // 强制根据新的 chat 数组渲染 UI
                 await printMessages();
                 // 更新群组的当前聊天文件（虽然恢复了，但群组对象中的 chat_id 可能没变，下次启动还是加载原来的）
                 const groupToUpdate = context.groups.find(g => g.id === groupId);
                 if(groupToUpdate) {
                    groupToUpdate.chat_id = cleanFilename; // 更新群组对象中的当前聊天文件名
                    await saveGroupChat(groupId, true); // 保存群组设置
                 }


            } else if (characterId !== undefined) { // 恢复角色聊天
                 console.log(`[${pluginId}] Restoring character chat ${cleanFilename} for character index ${characterId}`);
                // openCharacterChat(filenameWithoutExtension) 是一个核心函数，
                // 它会加载指定的聊天文件，清空当前 UI，更新角色对象的 chat 属性，
                // 重新渲染 UI，并触发保存设置。这是最推荐的方式。
                await openCharacterChat(cleanFilename);

            } else {
                throw new Error('No character or group selected.');
            }

            toastr.success(t`Chat "${filename}" restored successfully.`);
            // 恢复成功后，关闭弹窗
            Popup.close();

        } catch (error) {
            console.error(`[${pluginId}] Error restoring chat:`, error);
            toastr.error(t`Failed to restore chat "${filename}".`);
        } finally {
            hideLoader();
        }
    });

    // --- 8. 为“关闭”按钮绑定点击事件 ---
    $closeButton.on('click', () => {
        Popup.close(); // 关闭弹窗
    });


    console.log(`[${pluginId}] Plugin initialized.`);
});
