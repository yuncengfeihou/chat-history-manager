// public/extensions/third-party/my-ui-injection-plugin/index.js

// 导入 SillyTavern 提供的辅助函数
// renderExtensionTemplateAsync 用于加载插件目录下的 HTML 模板
import { renderExtensionTemplateAsync } from '../../../extensions.js';
// getContext 用于获取当前的聊天上下文（虽然本示例没用到，但实际插件中非常常用）
// import { getContext } from '../../../../script.js';
// Popup, callGenericPopup 用于创建弹窗（虽然本示例没用到，但实际插件中常用）
// import { Popup, POPUP_TYPE, POPUP_RESULT, callGenericPopup } from '../../../../popup.js';


// 定义插件文件夹的名称，用于加载模板
const pluginFolderName = 'chat-history-manager';

// 定义将要注入到每条消息上的按钮的 HTML 结构
// 直接定义为字符串更方便，因为结构比较简单且会重复使用
const messageButtonHtml = `
    <div class="mes_button my-plugin-message-button" title="消息操作 (UI 注入示例)">
        <i class="fa-solid fa-flag"></i> <!-- 示例：使用 Font Awesome 图标 -->
    </div>
`;


// 这是插件的主入口点，所有需要操作 DOM 的代码都应该放在 jQuery(async () => { ... }); 里面
// 这能确保页面的 HTML 结构已经加载完成，可以安全地查找和操作元素
jQuery(async () => {
    console.log(`[${pluginFolderName}] 插件已加载！`);

    // --- 1. 注入内容到“扩展”页面 (#translation_container) ---
    try {
        // 使用 renderExtensionTemplateAsync 加载 settings_area.html 模板
        // 第一个参数是相对于 public/extensions/ 的路径
        // 第二个参数是 HTML 文件名，不带 .html 后缀！
        const settingsHtml = await renderExtensionTemplateAsync(`third-party/${pluginFolderName}`, 'settings_area');

        // 找到目标容器并追加 HTML 内容
        // 尝试 '#translation_container'，如果你的 SillyTavern 版本较老，可能需要试试 '#extensions_settings'
        const $settingsContainer = $('#translation_container');
        if ($settingsContainer.length) {
            $settingsContainer.append(settingsHtml);
            console.log(`[${pluginFolderName}] 已添加设置界面到 #translation_container`);

            // 获取设置界面中的按钮元素，并为其绑定点击事件
            $('#my-plugin-settings-button').on('click', () => {
                alert(`[${pluginFolderName}] 你点击了扩展设置里的按钮！`);
                // 在这里可以添加更复杂的逻辑，比如打开配置弹窗等
            });
        } else {
            console.warn(`[${pluginFolderName}] 未找到 #translation_container 或 #extensions_settings 容器，无法注入设置界面。`);
        }


    } catch (error) {
        console.error(`[${pluginFolderName}] 加载或注入 settings_area.html 失败:`, error);
    }
    // --- 注入“扩展”页面结束 ---


    // --- 2. 注入按钮到输入框右侧区域 (#data_bank_wand_container) ---
    try {
        // 使用 renderExtensionTemplateAsync 加载 input_area_button.html 模板
        const inputButtonHtml = await renderExtensionTemplateAsync(`third-party/${pluginFolderName}`, 'input_area_button');

        // 找到目标容器 (#data_bank_wand_container) 并追加按钮 HTML
        const $inputButtonContainer = $('#data_bank_wand_container');
         if ($inputButtonContainer.length) {
            $inputButtonContainer.append(inputButtonHtml);
            console.log(`[${pluginFolderName}] 已添加按钮到 #data_bank_wand_container`);

            // 获取注入的按钮元素 (使用其 ID) 并为其绑定点击事件
            $('#my_plugin_input_button').on('click', () => {
                alert(`[${pluginFolderName}] 你点击了输入框旁边的插件按钮！`);
                // 在这里可以添加快捷操作逻辑，比如插入特定文本、触发生成等
            });
        } else {
             console.warn(`[${pluginFolderName}] 未找到 #data_bank_wand_container 容器，无法注入输入区域按钮。`);
        }

    } catch (error) {
        console.error(`[${pluginFolderName}] 加载或注入 input_area_button.html 失败:`, error);
    }
    // --- 注入输入框右侧区域结束 ---


    // --- 3. 注入按钮到每条聊天消息 (.extraMesButtons) ---
    try {
        // 找到所有当前页面上已存在的消息的附加按钮容器 (.extraMesButtons)
        // 并将我们定义好的消息按钮 HTML 追加进去
        $('.extraMesButtons').append(messageButtonHtml);
        console.log(`[${pluginFolderName}] 已添加按钮到现有的 .extraMesButtons`);

        // 使用事件委托 (Event Delegation) 来处理消息按钮的点击事件
        // 这是处理动态添加元素（如新生成的消息）事件监听的推荐方式
        // 我们将监听器绑定到 #chat 容器上，当点击事件来源于 .my-plugin-message-button 元素时触发
        $('#chat').on('click', '.my-plugin-message-button', function(event) {
            // 'this' 在事件委托的回调函数中指向实际被点击的那个 .my-plugin-message-button 元素

            alert(`[${pluginFolderName}] 你点击了消息上的插件按钮！`);

            // (可选) 获取这条消息的 ID
            // .closest('.mes') 向上查找距离当前元素最近的、带有 .mes 类的祖先元素（即消息容器）
            // .attr('mesid') 读取该消息容器的 mesid 属性
            const $messageElement = $(this).closest('.mes');
            const messageId = $messageElement.attr('mesid');

            if (messageId !== undefined) { // mesid 可能是一个字符串数字
                console.log(`[${pluginFolderName}] 点击了消息 ID: ${messageId} 上的按钮`);
                // 你可以使用 messageId 来查找 chat 数组中对应的消息对象
                // const context = getContext();
                // const message = context.chat[parseInt(messageId)];
                // if (message) {
                //     console.log('对应消息内容:', message.mes);
                // }
            } else {
                 console.warn(`[${pluginFolderName}] 无法获取消息 ID`);
            }

            // (可选) 阻止事件进一步冒泡，如果不需要让点击事件影响到父元素（如消息本身的可编辑区域）
            // event.stopPropagation();
        });
        console.log(`[${pluginFolderName}] 已为 .my-plugin-message-button 设置事件委托`);

    } catch(error) {
        console.error(`[${pluginFolderName}] 添加消息按钮或设置事件委托失败:`, error);
    }
    // --- 注入消息按钮结束 ---


    console.log(`[${pluginFolderName}] 所有 UI 注入尝试完成。`);
});
