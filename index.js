// ============================================================
// 小剧场收藏夹 Mini Theater Vault
// 一个 SillyTavern 第三方扩展：本地保存"小剧场"文本，
// 支持作者标注、分类/标签/搜索/排序/折叠/内存查看/自定义阈值/批量删除，
// 并可一键插入或发送到聊天框。
// ============================================================

import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const MODULE_NAME = "mini_theater_vault";

let currentEditId = null;
let expandedCategories = new Set(); // 改为记录"已展开"的分类，默认全部折叠
let batchMode = false;
let selectedIds = new Set();

// ---------------- 数据层 ----------------

function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = {
            entries: [],
            warnThreshold: 200,
            dangerThreshold: 1024,
        };
    }
    const s = extension_settings[MODULE_NAME];
    if (!Array.isArray(s.entries)) s.entries = [];
    if (typeof s.warnThreshold !== "number") s.warnThreshold = 200;
    if (typeof s.dangerThreshold !== "number") s.dangerThreshold = 1024;
    return s;
}

function persist() {
    saveSettingsDebounced();
}

function generateId() {
    return `mt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function seedDefaultEntry(settings) {
    if (settings.entries.length === 0) {
        settings.entries.push({
            id: generateId(),
            title: "示例·百物语",
            author: "苹果老师的天才构想",
            category: "刀剑乱舞",
            tags: ["习俗", "历史", "日常"],
            content:
                "现在停止角色扮演。请把时间线调整到{{user}}和{{char}}交往前的时间点，在这个背景下，如果{{user}}在深夜失眠、好奇着想尝试百物语的话，两人会怎么相处呢？\n请生成一个小剧场，内容是{{char}}和{{user}}的行动和相处。会是什么样的场景呢？会去现世的店、万屋的店、还是出阵时去当时历史的店？会涉及些什么有趣的内容呢？会不会发生一些很好玩的状况或者事后衍生出讨论和吐槽呢？需符合{{user}}和{{char}}的背景设定，请结合性格、背景故事、日常偏好、人际关系等展开情节，字数要求4000字以上，如果字数不够可以适当拉长，字数没有上限。",
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    }
}

// ---------------- 样式注入 ----------------

function injectStyles() {
    if (document.getElementById("mt_dynamic_styles")) return;
    const style = document.createElement("style");
    style.id = "mt_dynamic_styles";
    style.textContent = `
        /* 工具栏 */
        .mt-toolbar {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
        }
        .mt-toolbar > input[type="text"] {
            flex: 1 1 200px;
            min-width: 120px;
        }
        .mt-toolbar > select {
            flex: 0 1 auto;
            min-width: 110px;
        }

        /* 批量操作栏 */
        .mt-batch-bar {
            display: none;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            padding: 6px 8px;
            margin-top: 6px;
            background: rgba(0,0,0,0.04);
            border-radius: 6px;
        }
        .mt-batch-bar.show { display: flex; }
        .mt-batch-label {
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
            user-select: none;
        }
        #mt_batch_delete:disabled { opacity: 0.5; cursor: not-allowed; }

        /* 内存占用条 */
        .mt-memory-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 8px;
            margin-top: 6px;
            font-size: 0.85em;
            border-radius: 6px;
            background: rgba(100, 200, 100, 0.12);
            color: #2a6;
            transition: background 0.3s, color 0.3s;
        }
        .mt-memory-bar.warn {
            background: rgba(230, 180, 50, 0.15);
            color: #a70;
        }
        .mt-memory-bar.danger {
            background: rgba(230, 80, 80, 0.12);
            color: #c33;
        }
        .mt-memory-bar .mt-memory-right {
            display: flex;
            align-items: center;
            gap: 6px;
            opacity: 0.85;
            font-size: 0.95em;
        }
        #mt_memory_settings_btn {
            padding: 1px 5px;
            font-size: 0.85em;
            line-height: 1;
            border-radius: 4px;
        }

        /* 阈值设置面板 */
        .mt-memory-settings {
            display: none;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            padding: 6px 10px;
            font-size: 0.8em;
            background: rgba(0,0,0,0.04);
            border-radius: 0 0 6px 6px;
            margin-top: -2px;
        }
        .mt-memory-settings label {
            display: flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
        }
        .mt-memory-settings input[type="number"] {
            width: 65px;
            padding: 2px 4px;
            border-radius: 4px;
            border: 1px solid rgba(0,0,0,0.15);
            font-size: 0.95em;
        }
        .mt-memory-settings .menu_button {
            padding: 2px 10px;
            font-size: 0.9em;
        }

               /* 分类折叠 */
        .mt-group { margin-bottom: 10px; }
        .mt-group-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px 12px; background: rgba(120,120,120,0.15);
            cursor: pointer; user-select: none; font-weight: 600;
            transition: background 0.2s;
            border-radius: 8px;
            position: relative;
        }
        .mt-group-header:hover { background: rgba(120,120,120,0.25); }
        .mt-group-header .mt-group-title {
            display: flex; align-items: center; gap: 8px;
        }
        .mt-group-header .mt-group-count {
            font-size: 0.8em; opacity: 0.6; font-weight: 400;
        }
        .mt-group-header .mt-group-arrow {
            transition: transform 0.2s ease; font-size: 0.9em;
        }
        .mt-group.collapsed .mt-group-arrow { transform: rotate(-90deg); }

        .mt-group-items {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 5000px;
            overflow: hidden;
            transition: max-height 0.35s ease-out, opacity 0.3s ease, padding 0.3s ease, gap 0.35s ease;
            opacity: 1;
            padding: 8px 4px;
        }
        .mt-group.collapsed .mt-group-items {
            max-height: 0;
            opacity: 0;
            padding-top: 0;
            padding-bottom: 0;
            gap: 0;
        }

        /* 批量复选框 */
        .mt-item { display: block; }
        .mt-item.batch-mode { display: flex; gap: 8px; align-items: flex-start; }
        .mt-item-check {
            display: none;
            flex-shrink: 0;
            margin-top: 4px;
            cursor: pointer;
        }
        .mt-item.batch-mode .mt-item-check { display: block; }
        .mt-item-check input {
            width: 16px;
            height: 16px;
            cursor: pointer;
        }

        /* 标签样式 */
        .mt-tag {
            display: inline-block;
            background: rgba(120, 120, 120, 0.12);
            color: rgba(80, 80, 80, 0.85);
            font-size: 0.82em;
            padding: 2px 10px;
            border-radius: 999px;
            line-height: 1.4;
            white-space: nowrap;
            transition: background 0.2s, color 0.2s;
        }
        .mt-tag:hover {
            background: rgba(120, 120, 120, 0.22);
            color: rgba(60, 60, 60, 0.95);
        }
        .mt-item-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 4px;
            margin-bottom: 2px;
        }
    `;
    document.head.appendChild(style);
}

// ---------------- UI 构建 ----------------

function panelHtml() {
    return `
    <div id="mt_overlay" class="mt-overlay"></div>
    <div id="mini_theater_panel" class="mt-panel">
        <div class="mt-header">
            <span class="mt-title"><i class="fa-solid fa-masks-theater"></i> 小剧场收藏夹</span>
            <div class="mt-header-btns">
                <button id="mt_batch" class="menu_button" title="批量选择"><i class="fa-solid fa-list-check"></i></button>
                <button id="mt_add" class="menu_button" title="新增小剧场"><i class="fa-solid fa-plus"></i></button>
                <button id="mt_export" class="menu_button" title="导出备份 JSON"><i class="fa-solid fa-download"></i></button>
                <button id="mt_import" class="menu_button" title="导入备份 JSON"><i class="fa-solid fa-upload"></i></button>
                <button id="mt_close" class="menu_button" title="关闭"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="mt-toolbar">
            <input id="mt_search" type="text" placeholder="搜索标题 / 内容 / 标签 / 作者..." />
            <select id="mt_category_filter"><option value="">全部分类</option></select>
            <select id="mt_sort" title="排序方式">
                <option value="updatedAt_desc">最新编辑</option>
                <option value="updatedAt_asc">最早编辑</option>
                <option value="createdAt_desc">最新创建</option>
                <option value="createdAt_asc">最早创建</option>
                <option value="title_asc">名称 A-Z</option>
                <option value="title_desc">名称 Z-A</option>
            </select>
        </div>
        <div id="mt_batch_bar" class="mt-batch-bar">
            <label class="mt-batch-label"><input type="checkbox" id="mt_select_all"> 全选当前</label>
            <button id="mt_batch_delete" class="menu_button" disabled><i class="fa-solid fa-trash"></i> 删除选中 (<span id="mt_selected_count">0</span>)</button>
            <button id="mt_batch_cancel" class="menu_button">完成</button>
        </div>
        <div id="mt_memory_bar" class="mt-memory-bar">
            <span><i class="fa-solid fa-database"></i> <span id="mt_memory_text">计算中…</span></span>
            <span class="mt-memory-right">
                <span id="mt_entry_count">0</span> 条小剧场
                <button id="mt_memory_settings_btn" class="menu_button" title="自定义警告阈值"><i class="fa-solid fa-gear"></i></button>
            </span>
        </div>
        <div id="mt_memory_settings" class="mt-memory-settings">
            <label>🟡 黄色警告 ≥ <input id="mt_warn_kb" type="number" min="1" value="200"> KB</label>
            <label>🔴 红色警告 ≥ <input id="mt_danger_kb" type="number" min="1" value="1024"> KB</label>
            <button id="mt_save_threshold" class="menu_button">保存</button>
        </div>
        <div id="mt_list" class="mt-list"></div>
        <input id="mt_import_file" type="file" accept="application/json" style="display:none;" />
    </div>
    <div id="mini_theater_editor" class="mt-editor">
        <div class="mt-editor-inner">
            <h3 id="mt_editor_title">新增小剧场</h3>
            <label>标题</label>
            <input id="mt_field_title" type="text" placeholder="给这段小剧场起个名字" />
            <div class="mt-editor-row">
                <div>
                    <label>作者</label>
                    <input id="mt_field_author" type="text" placeholder="你的名字/昵称" />
                </div>
                <div>
                    <label>分类</label>
                    <input id="mt_field_category" list="mt_category_list" type="text" placeholder="如：日常 / 约会 / 历史" />
                    <datalist id="mt_category_list"></datalist>
                </div>
            </div>
            <label>标签（用逗号分隔）</label>
            <input id="mt_field_tags" type="text" placeholder="例如：服饰,历史,搞笑" />
            <label>正文内容</label>
            <textarea id="mt_field_content" rows="10" placeholder="粘贴或输入小剧场文本，可包含 {{user}} / {{char}} 宏，发送时会自动替换"></textarea>
            <div class="mt-editor-actions">
                <button id="mt_save" class="menu_button">保存</button>
                <button id="mt_cancel" class="menu_button">取消</button>
            </div>
        </div>
    </div>`;
}

// 不再预设默认分类，只从用户已有条目中收集
function getAllCategories(settings) {
    const set = new Set();
    settings.entries.forEach((e) => {
        if (e.category) set.add(e.category);
    });
    return Array.from(set);
}

function updateCategoryOptions() {
    const settings = getSettings();
    const categories = getAllCategories(settings);

    const $filter = $("#mt_category_filter");
    const currentVal = $filter.val();
    $filter.empty().append(`<option value="">全部分类</option>`);
    categories.forEach((c) => $filter.append(`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`));
    if (categories.includes(currentVal)) $filter.val(currentVal);

    const $list = $("#mt_category_list");
    $list.empty();
    categories.forEach((c) => $list.append(`<option value="${escapeHtml(c)}"></option>`));
}

// 计算并更新内存占用显示
function updateMemoryInfo() {
    const settings = getSettings();
    const count = settings.entries.length;
    const warnThreshold = settings.warnThreshold;
    const dangerThreshold = settings.dangerThreshold;

    const json = JSON.stringify(settings.entries);
    const bytes = new Blob([json]).size;

    let sizeText;
    if (bytes < 1024) {
        sizeText = `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
        sizeText = `${(bytes / 1024).toFixed(1)} KB`;
    } else {
        sizeText = `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    $("#mt_memory_text").text(`占用 ${sizeText}`);
    $("#mt_entry_count").text(count);

    const $bar = $("#mt_memory_bar");
    $bar.removeClass("warn danger");
    const kb = bytes / 1024;
    if (kb >= dangerThreshold) {
        $bar.addClass("danger");
    } else if (kb >= warnThreshold) {
        $bar.addClass("warn");
    }
}

function updateBatchBar() {
    if (!batchMode) {
        $("#mt_batch_bar").removeClass("show");
        return;
    }
    $("#mt_batch_bar").addClass("show");
    const count = selectedIds.size;
    $("#mt_selected_count").text(count);
    $("#mt_batch_delete").prop("disabled", count === 0);

    const allCheckboxes = $(".mt-checkbox");
    const allChecked = allCheckboxes.length > 0 && allCheckboxes.toArray().every(cb => $(cb).prop("checked"));
    $("#mt_select_all").prop("checked", allChecked);
}

function renderEntryCard(entry) {
    const previewRaw = entry.content.slice(0, 120).replace(/\n/g, " ");
    const preview = escapeHtml(previewRaw);
    const tags = (entry.tags || []).map((t) => `<span class="mt-tag">#${escapeHtml(t)}</span>`).join("");
    const tagsHtml = (entry.tags || []).length > 0
        ? `<div class="mt-item-tags">${tags}</div>`
        : "";
    const date = new Date(entry.updatedAt).toLocaleDateString();
    const batchClass = batchMode ? "batch-mode" : "";
    const checkbox = batchMode
        ? `<label class="mt-item-check"><input type="checkbox" class="mt-checkbox" value="${entry.id}" ${selectedIds.has(entry.id) ? "checked" : ""}></label>`
        : "";
    return `
        <div class="mt-item ${batchClass}" data-id="${entry.id}">
            ${checkbox}
            <div class="mt-item-body" style="flex:1;min-width:0;">
                <div class="mt-item-head">
                    <strong>${escapeHtml(entry.title)}</strong>
                    <span class="mt-badge">${escapeHtml(entry.category || "未分类")}</span>
                </div>
                <div class="mt-item-meta">作者：${escapeHtml(entry.author || "匿名")} · ${date}</div>
                ${tagsHtml}
                <div class="mt-item-preview">${preview}${entry.content.length > 120 ? "…" : ""}</div>
                <div class="mt-item-actions">
                    <button class="menu_button mt-send" title="直接发送"><i class="fa-solid fa-paper-plane"></i> 发送</button>
                    <button class="menu_button mt-insert" title="插入到输入框"><i class="fa-solid fa-arrow-turn-down"></i> 插入</button>
                    <button class="menu_button mt-copy" title="复制到剪贴板"><i class="fa-solid fa-copy"></i></button>
                    <button class="menu_button mt-edit" title="编辑"><i class="fa-solid fa-pen"></i></button>
                    <button class="menu_button mt-delete" title="删除"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        </div>
    `;
}

function renderList() {
    const settings = getSettings();
    const keyword = ($("#mt_search").val() || "").toString().trim().toLowerCase();
    const category = $("#mt_category_filter").val();
    const sortMode = $("#mt_sort").val() || "updatedAt_desc";

    let entries = settings.entries.slice();

    // 筛选
    if (category) {
        entries = entries.filter((e) => e.category === category);
    }
    if (keyword) {
        entries = entries.filter((e) => {
            const hay = [e.title, e.author, e.category, e.content, (e.tags || []).join(",")]
                .join(" ")
                .toLowerCase();
            return hay.includes(keyword);
        });
    }

    // 排序
    const [sortKey, sortDir] = sortMode.split("_");
    entries.sort((a, b) => {
        let va, vb;
        if (sortKey === "title") {
            va = (a.title || "").toLowerCase();
            vb = (b.title || "").toLowerCase();
        } else {
            va = a[sortKey] || 0;
            vb = b[sortKey] || 0;
        }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
    });

    const $list = $("#mt_list");
    $list.empty();

    if (entries.length === 0) {
        $list.append(`<div class="mt-empty">没有找到匹配的小剧场，点右上角 ➕ 新增一个吧～</div>`);
        updateMemoryInfo();
        updateBatchBar();
        return;
    }

    // 按分类分组
    const groups = {};
    entries.forEach((e) => {
        const cat = e.category || "未分类";
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(e);
    });

    // 分类顺序也跟随当前排序
    const groupNames = Object.keys(groups);
    groupNames.sort((ga, gb) => {
        const aFirst = groups[ga][0];
        const bFirst = groups[gb][0];
        let va, vb;
        if (sortKey === "title") {
            va = ga.toLowerCase();
            vb = gb.toLowerCase();
        } else {
            va = aFirst[sortKey] || 0;
            vb = bFirst[sortKey] || 0;
        }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
    });

    groupNames.forEach((cat) => {
        const catEntries = groups[cat];
        // 默认折叠！只有用户点过的分类才会展开
        const isCollapsed = !expandedCategories.has(cat);
        const itemsHtml = catEntries.map((e) => renderEntryCard(e)).join("");

        $list.append(`
            <div class="mt-group ${isCollapsed ? "collapsed" : ""}" data-category="${escapeHtml(cat)}">
                <div class="mt-group-header">
                    <span class="mt-group-title">
                        <i class="fa-solid fa-chevron-down mt-group-arrow"></i>
                        <span>${escapeHtml(cat)}</span>
                    </span>
                    <span class="mt-group-count">${catEntries.length} 条</span>
                </div>
                <div class="mt-group-items">${itemsHtml}</div>
            </div>
        `);
    });

    updateMemoryInfo();
    updateBatchBar();
}

// ---------------- 发送/插入 ----------------

function sendToChat(text, autoSend) {
    const textarea = document.getElementById("send_textarea");
    if (!textarea) {
        toastr.error("未找到聊天输入框，请确认当前处于聊天界面");
        return;
    }
    textarea.value = text;
    $(textarea).trigger("input").trigger("change");

    if (autoSend) {
        setTimeout(() => {
            const sendBtn = document.getElementById("send_but");
            if (sendBtn) sendBtn.click();
        }, 50);
        toastr.success("已发送");
    } else {
        textarea.focus();
        toastr.success("已插入到输入框，请检查后发送");
    }
}

// ---------------- 编辑器 ----------------

function openEditor(entry) {
    currentEditId = entry ? entry.id : null;
    $("#mt_editor_title").text(entry ? "编辑小剧场" : "新增小剧场");
    $("#mt_field_title").val(entry ? entry.title : "");
    $("#mt_field_author").val(entry ? entry.author : "");
    $("#mt_field_category").val(entry ? entry.category : "");
    $("#mt_field_tags").val(entry ? (entry.tags || []).join(", ") : "");
    $("#mt_field_content").val(entry ? entry.content : "");
    updateCategoryOptions();
    $("#mini_theater_editor").addClass("mt-show");
}

function closeEditor() {
    $("#mini_theater_editor").removeClass("mt-show");
    currentEditId = null;
}

function saveEditor() {
    const title = $("#mt_field_title").val().toString().trim();
    const content = $("#mt_field_content").val().toString().trim();
    if (!title || !content) {
        toastr.warning("标题和正文都不能为空哦");
        return;
    }
    const author = $("#mt_field_author").val().toString().trim() || "匿名";
    const category = $("#mt_field_category").val().toString().trim() || "其他";
    const tags = $("#mt_field_tags")
        .val()
        .toString()
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean);

    const settings = getSettings();
    const now = Date.now();

    if (currentEditId) {
        const entry = settings.entries.find((e) => e.id === currentEditId);
        if (entry) {
            Object.assign(entry, { title, author, category, tags, content, updatedAt: now });
        }
    } else {
        settings.entries.push({
            id: generateId(),
            title,
            author,
            category,
            tags,
            content,
            createdAt: now,
            updatedAt: now,
        });
    }

    persist();
    closeEditor();
    updateCategoryOptions();
    renderList();
    toastr.success("已保存");
}

// ---------------- 导入 / 导出 ----------------

function exportEntries() {
    const settings = getSettings();
    const blob = new Blob([JSON.stringify(settings.entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mini_theater_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function importEntries(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            if (!Array.isArray(data)) throw new Error("格式不正确");
            const settings = getSettings();
            let count = 0;
            data.forEach((item) => {
                if (item && item.title && item.content) {
                    settings.entries.push({
                        id: generateId(),
                        title: String(item.title),
                        author: String(item.author || "匿名"),
                        category: String(item.category || "其他"),
                        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
                        content: String(item.content),
                        createdAt: item.createdAt || Date.now(),
                        updatedAt: Date.now(),
                    });
                    count++;
                }
            });
            persist();
            updateCategoryOptions();
            renderList();
            toastr.success(`成功导入 ${count} 条小剧场`);
        } catch (e) {
            toastr.error("导入失败：文件格式不正确");
        }
    };
    reader.readAsText(file);
}

// ---------------- 事件绑定 ----------------

function bindEvents() {
    $(document).on("click", "#mt_close, #mt_overlay", () => {
        $("#mini_theater_panel, #mt_overlay").removeClass("mt-show");
    });

    $(document).on("click", "#mt_add", () => openEditor(null));
    $(document).on("click", "#mt_cancel", closeEditor);
    $(document).on("click", "#mt_save", saveEditor);

    $(document).on("focus", "#mini_theater_editor input, #mini_theater_editor textarea", function () {
        const el = this;
        setTimeout(() => {
            el.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 300);
    });

    $(document).on("input", "#mt_search", renderList);
    $(document).on("change", "#mt_category_filter", renderList);
    $(document).on("change", "#mt_sort", renderList);

    // 分类折叠/展开 —— 默认折叠，点击展开
    $(document).on("click", ".mt-group-header", function () {
        const $group = $(this).closest(".mt-group");
        const cat = $group.data("category");
        if ($group.hasClass("collapsed")) {
            $group.removeClass("collapsed");
            expandedCategories.add(cat);
        } else {
            $group.addClass("collapsed");
            expandedCategories.delete(cat);
        }
    });

    // 批量模式
    $(document).on("click", "#mt_batch", () => {
        batchMode = !batchMode;
        if (!batchMode) selectedIds.clear();
        renderList();
    });

    $(document).on("change", ".mt-checkbox", function () {
        const id = $(this).val();
        if ($(this).prop("checked")) {
            selectedIds.add(id);
        } else {
            selectedIds.delete(id);
        }
        updateBatchBar();
    });

    $(document).on("change", "#mt_select_all", function () {
        const checked = $(this).prop("checked");
        $(".mt-checkbox").each(function () {
            const id = $(this).val();
            $(this).prop("checked", checked);
            if (checked) selectedIds.add(id);
            else selectedIds.delete(id);
        });
        updateBatchBar();
    });

    $(document).on("click", "#mt_batch_delete", function () {
        if (selectedIds.size === 0) return;
        if (!confirm(`确定要删除选中的 ${selectedIds.size} 条小剧场吗？此操作无法撤销。`)) return;
        const settings = getSettings();
        const before = settings.entries.length;
        settings.entries = settings.entries.filter((x) => !selectedIds.has(x.id));
        persist();
        const deleted = before - settings.entries.length;
        selectedIds.clear();
        batchMode = false;
        updateCategoryOptions();
        renderList();
        toastr.success(`已删除 ${deleted} 条小剧场`);
    });

    $(document).on("click", "#mt_batch_cancel", function () {
        batchMode = false;
        selectedIds.clear();
        renderList();
    });

    // 内存阈值设置
    $(document).on("click", "#mt_memory_settings_btn", () => {
        const settings = getSettings();
        $("#mt_warn_kb").val(settings.warnThreshold);
        $("#mt_danger_kb").val(settings.dangerThreshold);
        $("#mt_memory_settings").slideToggle(150);
    });

    $(document).on("click", "#mt_save_threshold", () => {
        const settings = getSettings();
        const warn = parseInt($("#mt_warn_kb").val(), 10);
        const danger = parseInt($("#mt_danger_kb").val(), 10);

        if (isNaN(warn) || isNaN(danger) || warn < 1 || danger < 1) {
            toastr.warning("请输入有效的正整数");
            return;
        }
        if (warn >= danger) {
            toastr.warning("黄色阈值必须小于红色阈值");
            return;
        }

        settings.warnThreshold = warn;
        settings.dangerThreshold = danger;
        persist();
        updateMemoryInfo();
        $("#mt_memory_settings").slideUp(150);
        toastr.success("阈值设置已保存");
    });

    $(document).on("click", "#mt_export", exportEntries);
    $(document).on("click", "#mt_import", () => $("#mt_import_file").trigger("click"));
    $(document).on("change", "#mt_import_file", (e) => {
        const file = e.target.files[0];
        if (file) importEntries(file);
        e.target.value = "";
    });

    $(document).on("click", ".mt-item .mt-send", function () {
        const id = $(this).closest(".mt-item").data("id");
        const entry = getSettings().entries.find((x) => x.id === id);
        if (entry) sendToChat(entry.content, true);
    });

    $(document).on("click", ".mt-item .mt-insert", function () {
        const id = $(this).closest(".mt-item").data("id");
        const entry = getSettings().entries.find((x) => x.id === id);
        if (entry) sendToChat(entry.content, false);
    });

    $(document).on("click", ".mt-item .mt-copy", function () {
        const id = $(this).closest(".mt-item").data("id");
        const entry = getSettings().entries.find((x) => x.id === id);
        if (entry) {
            navigator.clipboard
                .writeText(entry.content)
                .then(() => toastr.success("已复制到剪贴板"))
                .catch(() => toastr.error("复制失败，请手动选择文本复制"));
        }
    });

    $(document).on("click", ".mt-item .mt-edit", function () {
        const id = $(this).closest(".mt-item").data("id");
        const entry = getSettings().entries.find((x) => x.id === id);
        if (entry) openEditor(entry);
    });

    $(document).on("click", ".mt-item .mt-delete", function () {
        const id = $(this).closest(".mt-item").data("id");
        if (!confirm("确定要删除这条小剧场吗？此操作无法撤销。")) return;
        const settings = getSettings();
        settings.entries = settings.entries.filter((x) => x.id !== id);
        persist();
        updateCategoryOptions();
        renderList();
        toastr.success("已删除");
    });
}

function openPanel() {
    $("#mini_theater_panel, #mt_overlay").addClass("mt-show");
    updateCategoryOptions();
    renderList();
}

// ---------------- 初始化 ----------------

jQuery(async () => {
    const settings = getSettings();
    seedDefaultEntry(settings);
    persist();

    injectStyles();
    $("body").append(panelHtml());
    bindEvents();

    const menuButton = `
        <div id="mini_theater_menu_button" class="list-group-item flex-container flexGap5 interactable" tabindex="0" title="小剧场收藏夹">
            <div class="fa-solid fa-masks-theater extensionsMenuExtensionButton"></div>
            <span>小剧场收藏夹</span>
        </div>`;
    $("#extensionsMenu").append(menuButton);
    $(document).on("click", "#mini_theater_menu_button", openPanel);
});