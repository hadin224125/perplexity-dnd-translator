/**
 * Perplexity D&D Translator (v2.2 - V13 Compatibility Fix)
 * FVTT v13 Compatible
 * * [V13 긴급 수정 사항]
 * 1. KeyboardManager 네임스페이스 변경 오류 수정 (단축키 등록 불가 현상 해결)
 * -> 문자열("Control", "Shift")과 정수형 우선순위(30)를 직접 사용하여 충돌 방지
 * 2. renderJournalDirectory Hook의 html.find 오류 수정
 * -> $(html)로 래핑하여 jQuery 함수 정상 작동하도록 수정
 */

const MODULE_ID = "perplexity-dnd-translator";
const SETTING_API_KEY = "apiKey";
const SETTING_MODEL = "model";

// D&D 5e 전문 번역 프롬프트
const SYSTEM_PROMPT = `
당신은 Dungeons & Dragons 5th Edition (D&D 5e) 전문 번역가입니다. 
다음 규칙을 엄격히 준수하여 입력된 텍스트를 '한국어'로 번역하세요:

1. HTML 태그(<p>, <b>, <h1> 등)가 있다면 구조를 절대 변경하지 말고 내용만 번역하십시오.
2. D&D 5e 공식 번역 용어를 사용하십시오 (예: Saving Throw -> 내성 굴림, Armor Class -> 방어도, Advantage -> 이점).
3. 문체는 판타지 RPG에 어울리는 자연스럽고 몰입감 있는 어조를 사용하십시오.
4. 고유명사나 주문 이름 등은 괄호 안에 영문을 병기하거나, 널리 쓰이는 표기를 따르십시오.
5. 설명만 하고 잡담은 하지 마십시오. 번역된 결과물만 출력하십시오.
`;

Hooks.once("init", () => {
    console.log(`${MODULE_ID} | Initializing V13 Fixes...`);

    // 1. API 키 설정
    game.settings.register(MODULE_ID, SETTING_API_KEY, {
        name: "Perplexity API Key",
        hint: "Perplexity API 키를 입력하세요 (pplx-...)",
        scope: "client",
        config: true,
        type: String,
        default: ""
    });

    // 2. 모델 선택 설정
    game.settings.register(MODULE_ID, SETTING_MODEL, {
        name: "AI Model",
        hint: "사용할 Perplexity 모델 (Sonar Pro 추천)",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "sonar-pro": "Sonar Pro (High Quality - 추천)",
            "sonar": "Sonar (Standard)",
            "llama-3.1-sonar-large-128k-online": "Legacy Model",
        },
        default: "sonar-pro"
    });

    // 키바인딩 등록
    registerKeybindings();
});

// ----------------------------------------------------------------------
// UI Hooks (버튼 및 아이콘) - V13 호환성 수정됨
// ----------------------------------------------------------------------

Hooks.on("getJournalSheetHeaderButtons", (journalSheet, buttons) => {
    buttons.unshift({
        label: "Translate (AI)",
        class: "perplexity-translate",
        icon: "fas fa-language",
        onclick: () => translateJournalEntry(journalSheet.document)
    });
});

Hooks.on("renderJournalDirectory", (app, html, data) => {
    // V13 수정: html이 jQuery 객체가 아닐 수 있으므로 래핑
    setTimeout(() => addTranslateIconsToDirectory($(html)), 100);
});

function addTranslateIconsToDirectory($html) {
    // V13 수정: $(html)로 받은 객체 사용
    const journalItems = $html.find(".document-name, .directory-item");
    
    journalItems.each((i, el) => {
        const $item = $(el).closest("[data-document-id]");
        const journalId = $item.data("documentId");
        
        if (!journalId || $item.find(".pplx-dir-icon").length > 0) return;

        const $icon = $(`<a class="pplx-dir-icon" title="AI 번역" style="flex: 0 0 20px; text-align: center; margin-right:5px; color:#d4af37;"><i class="fas fa-wand-magic-sparkles"></i></a>`);
        
        $icon.click((e) => {
            e.preventDefault();
            e.stopPropagation();
            const journal = game.journal.get(journalId);
            if (journal) translateJournalEntry(journal);
        });

        // 위치 조정
        const $controls = $item.find(".document-controls");
        if ($controls.length) {
            $controls.prepend($icon);
        } else {
            // 폴더 내부 아이템 등 구조가 다를 경우 대비
            const $name = $item.find(".document-name");
            if ($name.length) $name.before($icon);
        }
    });
}

// ----------------------------------------------------------------------
// 텍스트 선택 및 키바인딩 - V13 호환성 수정됨
// ----------------------------------------------------------------------

function getSelectedText() {
    let text = window.getSelection().toString().trim();
    
    // TinyMCE 에디터 내부 감지
    if (!text && typeof tinymce !== "undefined" && tinymce.activeEditor) {
        try {
            text = tinymce.activeEditor.selection.getContent({format: 'text'}).trim();
        } catch (e) { /* Ignore */ }
    }
    
    // ProseMirror (V12/V13 에디터) 감지
    if (!text) {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.classList.contains("ProseMirror")) {
            // ProseMirror는 기본적으로 window.getSelection에 잡히지만, 
            // 포커스 문제로 안 잡힐 경우를 대비해 추가 로직이 필요하다면 여기에 작성
        }
    }

    return text;
}

function registerKeybindings() {
    // V13 수정: KeyboardManager 상수를 직접 참조하지 않고 문자열/숫자 리터럴 사용
    
    // 1. Shift + L (팝업)
    game.keybindings.register(MODULE_ID, "translateToDialog", {
        name: "선택 텍스트 번역 (팝업)",
        hint: "드래그한 텍스트를 팝업으로 봅니다.",
        editable: [{ key: "KeyL", modifiers: ["Shift"] }], // "Shift" 문자열 사용
        onDown: async () => {
            const text = getSelectedText();
            if (!text) {
                ui.notifications.warn("텍스트를 드래그해주세요.");
                return true;
            }
            ui.notifications.info("AI 번역 요청 중...");
            const translated = await callPerplexityAPI(text);
            if (translated) showTranslationDialog(text, translated);
            return true;
        },
        precedence: 30, // CONST.KEYBINDING_PRECEDENCE.PRIORITY (30) 직접 사용
        restricted: false
    });

    // 2. Ctrl + L (채팅)
    game.keybindings.register(MODULE_ID, "translateToChat", {
        name: "선택 텍스트 번역 (채팅)",
        hint: "드래그한 텍스트를 채팅창에 띄웁니다.",
        editable: [{ key: "KeyL", modifiers: ["Control"] }], // "Control" 문자열 사용
        onDown: async () => {
            const text = getSelectedText();
            // 텍스트 없어도 이벤트를 먹어서 브라우저 주소창 이동 방지
            if (!text) return true; 
            
            ui.notifications.info("번역 중...");
            const translated = await callPerplexityAPI(text);
            if (translated) {
                ChatMessage.create({
                    content: `
                        <div class="dnd5e chat-card">
                            <header class="card-header flexrow"><h3 class="noborder">📜 번역 결과</h3></header>
                            <div class="card-content" style="margin-top:5px;">${translated.replace(/\n/g, "<br>")}</div>
                        </div>`
                });
            }
            return true; 
        },
        precedence: 30 // 우선순위 최상
    });

    // 3. Ctrl + J (저널 선택)
    game.keybindings.register(MODULE_ID, "translateJournalPicker", {
        name: "저널 선택 번역",
        editable: [{ key: "KeyJ", modifiers: ["Control"] }],
        onDown: () => {
            showJournalSelectDialog();
            return true;
        },
        precedence: 30
    });
}

// ----------------------------------------------------------------------
// 다이얼로그 및 API 핸들러 (기능 유지)
// ----------------------------------------------------------------------

function showTranslationDialog(original, translated) {
    const content = `
    <style>
        .pplx-container { display: flex; flex-direction: column; gap: 15px; }
        .pplx-section { display: flex; flex-direction: column; gap: 5px; }
        .pplx-box { border: 1px solid #7a7971; background: rgba(0, 0, 0, 0.05); border-radius: 4px; padding: 10px; max-height: 250px; overflow-y: auto; white-space: pre-wrap; line-height: 1.5; }
        .pplx-header { font-weight: bold; font-size: 1.1em; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #555; padding-bottom: 5px; margin-bottom: 5px; }
        .pplx-copy-icon { cursor: pointer; font-size: 0.8em; color: #2c3e50; background: #ecf0f1; border: 1px solid #bdc3c7; padding: 2px 8px; border-radius: 4px; transition: all 0.2s; }
        .pplx-copy-icon:hover { background: #3498db; color: white; border-color: #3498db; }
    </style>
    <div class="pplx-container">
        <div class="pplx-section">
            <div class="pplx-header"><span><i class="fas fa-quote-left"></i> Original</span></div>
            <div class="pplx-box" style="color: #555; font-style: italic;">${original}</div>
        </div>
        <div class="pplx-section">
            <div class="pplx-header">
                <span><i class="fas fa-language"></i> Translation</span>
                <span class="pplx-copy-icon" id="pplx-copy-btn"><i class="fas fa-copy"></i> Copy</span>
            </div>
            <div class="pplx-box">${translated}</div>
        </div>
    </div>`;

    new Dialog({
        title: "Perplexity AI 번역",
        content: content,
        buttons: {
            copyClose: { label: "복사 후 닫기", icon: '<i class="fas fa-paste"></i>', callback: () => copyToClipboard(translated) },
            close: { label: "닫기", icon: '<i class="fas fa-times"></i>' }
        },
        render: (html) => {
            html.find("#pplx-copy-btn").click((ev) => {
                copyToClipboard(translated);
                const btn = ev.currentTarget;
                btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => btn.innerHTML = '<i class="fas fa-copy"></i> Copy', 1500);
            });
        },
        default: "copyClose"
    }, { width: 550, resizable: true }).render(true);
}

function showJournalSelectDialog() {
    const journals = game.journal.contents.map(j => `<option value="${j.id}">${j.name}</option>`).join("");
    if (!journals) return ui.notifications.warn("번역할 저널이 없습니다.");

    new Dialog({
        title: "저널 선택 번역",
        content: `<div style="padding:10px;"><label>저널 선택:</label><select id="journal-select" style="width:100%; margin-top:5px;">${journals}</select></div>`,
        buttons: {
            translate: {
                label: "번역 시작",
                icon: '<i class="fas fa-wand-magic-sparkles"></i>',
                callback: (html) => {
                    const id = html.find("#journal-select").val();
                    translateJournalEntry(game.journal.get(id));
                }
            }
        }
    }).render(true);
}

async function translateJournalEntry(originalJournal) {
    const apiKey = game.settings.get(MODULE_ID, SETTING_API_KEY);
    if (!apiKey) return ui.notifications.error("API Key가 없습니다.");

    const confirm = await Dialog.confirm({
        title: "저널 번역",
        content: `<p><strong>${originalJournal.name}</strong> 전체를 번역하시겠습니까?</p>`
    });
    if (!confirm) return;

    ui.notifications.info(`'${originalJournal.name}' 번역 프로세스 시작...`);

    const newJournalData = {
        name: `${originalJournal.name} [KR]`,
        folder: originalJournal.folder,
        pages: []
    };

    const pages = originalJournal.pages.contents || originalJournal.pages;
    let successCount = 0;

    for (const page of pages) {
        ui.notifications.info(`페이지 번역 중... (${successCount + 1}/${pages.length})`);
        const pageData = page.toObject();
        
        try {
            if (page.type === "text") {
                const content = pageData.text.content;
                if (content && content.length > 0) {
                    await new Promise(r => setTimeout(r, 200)); 
                    const translatedContent = await callPerplexityAPI(content, true);
                    if (translatedContent) pageData.text.content = translatedContent;
                }
                const translatedTitle = await callPerplexityAPI(pageData.name);
                if (translatedTitle) pageData.name = translatedTitle.replace(/['"]/g, "").trim();
                successCount++;
            }
        } catch (e) {
            console.error(e);
        }
        newJournalData.pages.push(pageData);
    }

    const newJournal = await JournalEntry.create(newJournalData);
    ui.notifications.info("번역 완료!");
    newJournal?.sheet?.render(true);
}

async function callPerplexityAPI(text, isHtml = false) {
    const apiKey = game.settings.get(MODULE_ID, SETTING_API_KEY);
    const model = game.settings.get(MODULE_ID, SETTING_MODEL);
    
    if (!text || text.trim() === "") return null;

    try {
        const response = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT + (isHtml ? "\n(입력은 HTML 형식입니다. 태그 구조를 완벽히 보존하고 내용만 번역하세요.)" : "") },
                    { role: "user", content: text }
                ],
                temperature: 0.1
            })
        });

        if (!response.ok) {
            if (response.status === 400 || response.status === 401) ui.notifications.error("API 오류: 키나 모델을 확인하세요.");
            else if (response.status === 429) ui.notifications.warn("API 사용량 초과 (잠시 대기)");
            return null;
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
    } catch (error) {
        console.error("API Error:", error);
        return null;
    }
}

function copyToClipboard(text) {
    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    document.body.removeChild(temp);
    ui.notifications.info("클립보드에 복사되었습니다.");
}