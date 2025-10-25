// --- ANALYZER ELEMENTS ---
const textInput = document.getElementById('text-input');
const resultsContainer = document.getElementById('results-container');
const analyzeBtn = document.getElementById('analyze-btn');
const taskSelect = document.getElementById('task-select');

// Conditional Input Elements
const wordInputContainer = document.getElementById('word-input-container');
const wordInput = document.getElementById('word-input');
const sentenceInputContainer = document.getElementById('sentence-input-container');
const sentenceInput = document.getElementById('sentence-input');
const statementInputContainer = document.getElementById('statement-input-container');
const statementInput = document.getElementById('statement-input');
const paragraphInputContainer = document.getElementById('paragraph-input-container');
const paragraphInput = document.getElementById('paragraph-input');
const summaryLengthContainer = document.getElementById('summary-length-container');


// --- ANALYZER STATE ---
let inferenceList = [];
let currentInferenceIndex = 0;
let lastAnalyzedTextForInference = "";

let mainIdeaList = [];
let currentMainIdeaIndex = 0;
let lastAnalyzedTextForMainIdea = "";

let vocabList = [];
let currentVocabIndex = 0;
let lastAnalyzedTextForVocab = "";

let lastAnalyzedText = "";

// --- RESTATE LOGIC ---
const restateTypes = [
    { id: 'passiveVoice', name: 'Using Passive Voice', prompt: "You are an expert linguist. Your task is to paraphrase a given sentence in English **using only the passive voice**. First, provide the rewritten sentence in English. Then, in a new paragraph labeled '*Penjelasan:*', explain in Indonesian exactly how the subject and object were swapped to create the passive voice." },
    { id: 'indirectSpeech', name: 'As Indirect Speech', prompt: "You are an expert linguist. Your task is to paraphrase a given sentence in English **as if it were being reported (indirect speech)**. First, provide the rewritten sentence in English. Then, in a new paragraph labeled '*Penjelasan:*', explain in Indonesian how the sentence was changed to reported speech, mentioning changes in tense or pronouns if applicable." },
    { id: 'swappingSynonyms', name: 'Swapping Synonyms', prompt: "You are an expert linguist. Your task is to paraphrase a given sentence in English **by swapping key words with appropriate synonyms**. First, provide the rewritten sentence in English. Then, in a new paragraph labeled '*Penjelasan:*', list in Indonesian the original words and the synonyms you used to replace them. For example: 'mengubah X menjadi Y, dan A menjadi B'." },
    { id: 'changingStructure', name: 'Changing Structure', prompt: "You are an expert linguist. Your task is to paraphrase a given sentence in English **by significantly changing the clause order or. overall sentence structure** while preserving the meaning. First, provide the rewritten sentence in English. Then, in a new paragraph labeled '*Penjelasan:*', describe in Indonesian how the sentence structure was altered, for example, by moving a subordinate clause to the beginning." }
];
let restateUsageHistory = [];
let restateTypeWeights = {};

function initializeRestateWeights() {
    restateTypes.forEach(type => { restateTypeWeights[type.id] = 10; });
    restateUsageHistory = [];
}
function updateRestateWeights(usedTypeId) {
    restateUsageHistory.push(usedTypeId);
    if (restateUsageHistory.length >= restateTypes.length) { initializeRestateWeights(); return; }
    const UNUSED_WEIGHT = 10, BASE_USED_WEIGHT = 1;
    const historyReversed = [...restateUsageHistory].reverse();
    restateTypes.forEach(type => { const historyIndex = historyReversed.indexOf(type.id); restateTypeWeights[type.id] = (historyIndex === -1) ? UNUSED_WEIGHT : BASE_USED_WEIGHT + (2 * historyIndex); });
}
function selectRestateType() {
    const totalWeight = Object.values(restateTypeWeights).reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    for (const type of restateTypes) { random -= restateTypeWeights[type.id]; if (random <= 0) return type; }
    return restateTypes[0];
}
initializeRestateWeights();

// --- ANALYZER PROMPTS & DATA ---
const systemPrompts = {
    mainIdea: `You are an expert reading comprehension assistant. Your task is to identify the topic and main idea of the provided text.
    First, identify the single **Topic** of the text (1-3 words, in English).
    Then, generate 3-4 *different* paraphrased versions of the main idea. Each version must be accurate, have a different sentence structure, and use different synonyms where possible.

    For each version, you MUST follow this exact format, using Markdown for spacing:

    **Topic:**
    [State the single topic here, in English]

    **Main Idea:**
    [State the paraphrased main idea in a single, clear, and concise **English** sentence.]

    **Evidence:**
    "[The single, most representative sentence from the original text that best supports this main idea.]"

    **Penjelasan:**
    [Provide a **detailed** explanation in **Indonesian** for why this is the main idea, referencing the evidence sentence. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags.]

    Separate each complete main idea block with '|||'. Do not add any other text, numbering, or bullet points. Avoid using asterisks for emphasis outside of the specified bold labels.
    `,
    inference: `You are a highly skilled critical thinking expert, a master of "reading between the lines". Your task is to find 3-4 *deep, logical inferences* from the provided text and present them as a JSON array. An inference is a logical conclusion based on evidence; it is **NOT** just a paraphrase of the quote. It is **NOT** something the text says directly. It is a logical leap. You MUST format your entire response as a single, valid JSON array. Do not include any text outside the array, including "json" or backticks. Each object in the array must have the following structure: { "quote": "The single, specific sentence or phrase from the original text (in English) that acts as the evidence.", "clue": "A short hint or 'clue' in **Indonesian** that points the user's attention to *why* the quote is important for making a logical leap. **If you mention specific words from the quote, keep those words in English and wrap them in single quotes.** (e.g., 'Perhatikan penggunaan kata 'suddenly' yang menyiratkan kejadian tak terduga.')", "inference": "The final logical conclusion (the implied meaning) in **English**. **This MUST be a new insight that is *implied* by the quote, not just a restatement of it.**", "explanation": "A detailed explanation in **Indonesian** that clearly connects the 'quote' and the 'clue' to the 'inference'. It must explain *how* you made the logical leap. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags." } Ensure all strings are properly escaped within the JSON. Avoid using asterisks for emphasis outside of specified bold labels.`,
    trueFalse: `You are an expert reading comprehension and fact-checking assistant. Your task is to analyze the provided text and determine if the user's statement is True or False based *only* on the information given in the text. You MUST format your entire response as a single, valid JSON object. Do not include any text outside the object, including "json" or backticks. The JSON object must have the following structure: { "statement": "The user's statement that you evaluated (in English).", "result": "True" | "False", "quote": "The single, most relevant sentence or phrase from the original text (in English) that directly supports your True/False conclusion. If no single quote directly supports it (especially for False), briefly state why (e.g., 'Text does not mention this topic.')", "explanation": "A concise explanation in **Indonesian** clearly stating *why* the statement is True or False based on the provided quote or lack thereof in the text. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags." } Ensure all strings are properly escaped within the JSON. Base your judgment solely on the provided text. Avoid using asterisks for emphasis outside of specified bold labels.`,
    summary: (length) => `You are an expert reading comprehension assistant. Your task is to create a concise summary of the provided text. The summary should capture the key points and be approximately ${length} sentence(s) long. Avoid using asterisks for emphasis.`,
    keyThemes: `You are an expert text analyst. Your task is to identify the 3-5 main recurring themes or key topics discussed in the provided text and present them as a JSON array. You MUST format your entire response as a single, valid JSON array. Do not include any text outside the array, including "json" or backticks. Each object in the array must have the following structure:
    {
      "theme": "The key theme or topic in English (e.g., 'Solar Power Advancements', 'Ethical AI Dilemmas').",
      "explanation": "A concise explanation in **Indonesian** describing what the text says about this theme. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags."
    }
    Ensure all strings are properly escaped within the JSON.`,
    readabilityScore: `You are an expert readability analyst. Your task is to calculate the Flesch-Kincaid Reading Ease score for the provided text. Then, estimate the corresponding US Grade Level needed to understand the text. Finally, provide a detailed interpretation of the score in Indonesian, explaining *why* the text aligns with that grade level by considering factors like sentence structure (struktur kalimat), word choice/diction (pilihan kata/diksi), and the complexity of the subject matter or context (konteks dan subjek bahasan). When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags.

    Please format your response exactly like this:

    **Flesch-Kincaid Reading Ease:** [Score number]
    **Estimated Grade Level:** [Grade level, e.g., 8th Grade, College Graduate]
    **Penjelasan (Indonesian):** [Detailed interpretation in Indonesian covering sentence structure, diction, and context/subject matter.]

    Avoid using asterisks for emphasis outside of the specified bold labels.
    `,
    tone: `You are an expert literary analyst. Your task is to identify the tone of the provided text.
    First, state the primary tone in one or two words (e.g., 'Formal and Objective', 'Nostalgic and Melancholy').
    Then, add a line formatted exactly like this: **Evidence:** "[The single sentence or key phrase from the text that best exemplifies this tone.]"
    Finally, in a new paragraph, provide a brief explanation in Indonesian, referencing the evidence, to support your analysis. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags. Avoid using asterisks for emphasis outside of the specified bold labels.`,
    purpose: `You are an expert rhetorical analyst.
    IF the user provides a "SPECIFIC PARAGRAPH TO ANALYZE": Your task is to determine the primary purpose *of that specific paragraph* within the context of the larger text. State whether the purpose is to inform, persuade, entertain, introduce, exemplify, transition, conclude, etc. Then, add a line formatted exactly like this: **Evidence:** "[The key sentence or phrase *from that paragraph* that best demonstrates its purpose.]" Finally, in a new paragraph, explain your reasoning in Indonesian using the evidence. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags.
    IF NO specific paragraph is provided: Your task is to determine the primary purpose *of the entire provided text*. State whether the purpose is to inform, persuade, entertain, etc. Then, add a line formatted exactly like this: **Evidence:** "[The single sentence or key phrase *from the entire text* that best demonstrates its overall purpose.]" Finally, in a new paragraph, explain your reasoning in Indonesian using the evidence. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags.

    Avoid using asterisks for emphasis outside of the specified bold labels.`,
    genre: "You are an expert in literary and textual genres. Your task is to identify the most likely genre of the provided text (e.g., 'News Report', 'Science Fiction Short Story', 'Personal Essay', 'Technical Manual'). In a new paragraph, briefly justify your choice based on the text's style, content, and structure. Provide the justification in Indonesian. Avoid using asterisks for emphasis.",
    wordMeaning: `You are an expert lexicographer and reading comprehension assistant. Your task is to analyze the provided text based on the user's request. You MUST format your entire response as a single, valid JSON array. Do not include any text outside the array, including "json" or backticks. IF THE USER PROVIDES A SPECIFIC "WORD TO ANALYZE": You must analyze **only that word**. The JSON array will contain a **single object** with this structure: { "word": "The specific word the user asked for (in English).", "definition": "A simple, dictionary-style definition of the word in **English**.", "quote": "The full sentence from the text where the word appears. You MUST indicate the word, for example by placing it in quotes: 'The quick \"brown\" fox...'.", "explanation": "A detailed contextual explanation in **Indonesian** of what the word means *specifically within the context of that quote*. When referring to specific words or short phrases from the original text within this explanation, please wrap them in \`<code>\` tags." } IF THE "WORD TO ANALYZE" IS EMPTY: You must scan the text and find the 3-5 most important or difficult **Key Vocabulary** words. The JSON array will contain **multiple objects** (one for each word) using the *exact same structure* as above. Ensure all strings are properly escaped within the JSON. Avoid using asterisks for emphasis outside of specified bold labels.`,
};

const resultTitles = {
    mainIdea: "Main Idea",
    summary: "Summary",
    keyThemes: "Key Themes",
    readabilityScore: "Readability Score",
    inference: "Inference",
    trueFalse: "True or False?",
    tone: "Author's Tone",
    purpose: "Author's Purpose",
    genre: "Text Genre",
    wordMeaning: "Word Meaning Analysis"
};

// --- ANALYZER FUNCTIONS ---

function setLoading(isLoading) {
    analyzeBtn.disabled = isLoading;
    if (isLoading) { resultsContainer.innerHTML = `<div id="loading-indicator" class="text-center p-6 bg-white rounded-xl shadow-md border-blue-200"><div class="flex justify-center items-center space-x-2"><div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: -0.3s;"></div><div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: -0.15s;"></div><div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div></div><p class="mt-3 text-gray-600 text-sm">Analyzing text...</p></div>`; }
    else { const loadingIndicator = document.getElementById('loading-indicator'); if (loadingIndicator) loadingIndicator.remove(); }
}

// Function to extract and format evidence quote
function formatEvidenceQuote(rawContent) {
    // Match "Evidence:" case-insensitively, followed by optional spaces, and capture the quoted string
    const evidenceRegex = /\*\*Evidence:\*\*\s*"([^"]+)"/i;
    const match = rawContent.match(evidenceRegex);
    if (match && match[1]) {
        const quote = match[1].trim();
        // Remove the evidence line from the main content
        const contentWithoutEvidence = rawContent.replace(evidenceRegex, '').trim();
        const quoteHtml = `<div class="evidence-quote">"${quote}"</div>`;
        return { mainContent: contentWithoutEvidence, quoteHtml: quoteHtml };
    }
    return { mainContent: rawContent, quoteHtml: '' }; // No evidence found or format mismatch
}

// Function to apply final HTML formatting (bold, italics, code)
function applyFinalFormatting(text) {
     if (typeof text !== 'string') return 'Error: Invalid content format';
     return text
         .replace(/\n{2,}/g, '<br><br>') // Replace 2 or more newlines with a paragraph break
         .replace(/\n/g, '<br>')      // Replace single newlines with a line break
         .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
         .replace(/\*(.*?)\*/g, '<em>$1</em>')         // Italics
         .replace(/`([^`]+)`/g, '<code>$1</code>');      // Code/Highlight
}


function displayResult(title, content, options = {}) {
    resultsContainer.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'result-card bg-white p-6 rounded-2xl shadow-lg border border-blue-200';
    let formattedContent = "", isFallback = options?.isFallback, resultTitle = title, evidenceHtml = '';

    if (title === "Summary" && options.summaryLength) { resultTitle = `Summary (${options.summaryLength})`; }
    else if (title === "Author's Purpose" && options.analyzedParagraph) { resultTitle = `Purpose of Paragraph`; formattedContent += `<p class="mb-4 text-sm text-gray-500 italic">Analysis focuses on the specific paragraph you provided.</p>`; }
    else if (title === "Author's Purpose") { resultTitle = `Author's Purpose (Overall)`; formattedContent += `<p class="mb-4 text-sm text-gray-500 italic">Analysis focuses on the purpose of the entire text.</p>`; }

    if ((title.startsWith("Key Vocabulary") || title === "Word Meaning Analysis") && typeof content === 'object' && content !== null && !isFallback) {
        const quotedWordRegex = /"([^"]+)"/; const wordMatch = content.quote.match(quotedWordRegex);
        let formattedQuote = content.quote;
        if (wordMatch && wordMatch[1] === content.word) { formattedQuote = content.quote.replace(quotedWordRegex, `<strong>"${content.word}"</strong>`); }
        else { formattedQuote = content.quote.replace(content.word, `<strong>${content.word}</strong>`); }
        const explanationHtml = applyFinalFormatting(content.explanation); // Apply formatting
        formattedContent += `<div class="space-y-4"><div><strong class="block text-gray-800">Word:</strong> <p class="mt-1 text-xl font-semibold text-blue-700">${content.word}</p></div><div><strong class="block text-gray-800">Definition:</strong> <p class="mt-1">${content.definition}</p></div><div><strong class="block text-gray-800">Quote from Text:</strong> <p class="mt-1 italic">${formattedQuote}</p></div><div><strong class="block text-gray-800">Contextual Explanation (Penjelasan Kontekstual):</strong> <p class="mt-1">${explanationHtml}</p></div></div>`;
    } else if (title.startsWith("Inference") && typeof content === 'object' && content !== null && !isFallback) {
        const explanationHtml = applyFinalFormatting(content.explanation); // Apply formatting
        const clueHtml = applyFinalFormatting(content.clue); // Apply formatting
        formattedContent += `<div class="space-y-4"><div><strong class="block text-gray-800">Quote from Text:</strong> <p class="mt-1 italic">"${content.quote}"</p></div><div><strong class="block text-gray-800">Clue (Petunjuk):</strong> <p class="mt-1">${clueHtml}</p></div><button id="show-inference-btn" class="mt-2 bg-blue-100 text-blue-700 font-semibold py-2 px-4 rounded-lg hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200">Show Inference</button><div id="inference-reveal" class="hidden space-y-4 mt-4 pt-4 border-t border-gray-200"><div><strong class="block text-gray-800">Inference:</strong> <p class="mt-1 font-semibold text-blue-700">${content.inference}</p></div><div><strong class="block text-gray-800">Explanation (Penjelasan):</strong> <p class="mt-1">${explanationHtml}</p></div></div></div>`;
    } else if (title === "True or False?" && typeof content === 'object' && content !== null && !isFallback) {
        const resultClass = content.result === "True" ? "result-true" : "result-false";
        const explanationHtml = applyFinalFormatting(content.explanation); // Apply formatting
        formattedContent += `<div class="space-y-4"><div><strong class="block text-gray-800">Statement:</strong> <p class="mt-1 italic">"${content.statement}"</p></div><div><strong class="block text-gray-800">Result:</strong> <p class="mt-1 text-xl ${resultClass}">${content.result}</p></div><div><strong class="block text-gray-800">Evidence from Text:</strong> <p class="mt-1 italic evidence-quote">"${content.quote}"</p></div><div><strong class="block text-gray-800">Explanation (Penjelasan):</strong> <p class="mt-1">${explanationHtml}</p></div></div>`;
    } else if (title === "Key Themes") {
        if (Array.isArray(content) && content.length > 0 && typeof content[0] === 'object') {
            // It's the new JSON format
            let themesHtml = '<ul class="space-y-4">';
            content.forEach(item => {
                const theme = item.theme ? item.theme : 'No theme title';
                const explanation = item.explanation ? applyFinalFormatting(item.explanation) : 'No explanation provided.';
                themesHtml += `<li class="ml-4">
                                    <strong class="text-lg font-semibold text-blue-800">${theme}</strong>
                                    <p class="mt-1 ml-2 text-gray-700">${explanation}</p>
                                </li>`;
            });
            themesHtml += '</ul>';
            formattedContent += `<div id="key-themes-list">${themesHtml}</div>`;
        } else {
            // Fallback for old string format or error
            let themesHtml = applyFinalFormatting(content); // Apply formatting
            themesHtml = themesHtml.replace(/<li>/g, '<li class="ml-4">'); // Add margin to list items
            formattedContent += `<div id="key-themes-list"><ul>${themesHtml}</ul></div>`;
        }
    } else if (title === "Readability Score") {
        let score = 'N/A', grade = 'N/A', explanation = 'No explanation provided.';
        if (typeof content === 'string') {
            const lines = content.split('\n'); let explanationLines = []; let explanationStarted = false;
            lines.forEach(line => {
                const scoreMatch = line.match(/\*\*Flesch-Kincaid Reading Ease:\*\*\s*([\d\.]+)/i);
                const gradeMatch = line.match(/\*\*Estimated Grade Level:\*\*\s*(.+)/i);
                const explanationMatch = line.match(/\*\*Penjelasan \(Indonesian\):\*\*(.*)/i);
                if (scoreMatch) score = scoreMatch[1];
                else if (gradeMatch) grade = gradeMatch[1].trim();
                else if (explanationMatch) { explanationStarted = true; explanationLines.push(explanationMatch[1].trim()); }
                else if (explanationStarted) explanationLines.push(line.trim());
            });
            explanation = explanationLines.join('\n'); // Keep newlines for applyFinalFormatting
            if (!explanation.trim()) explanation = 'No explanation provided.';
            explanation = applyFinalFormatting(explanation); // Apply formatting to explanation
        }
        formattedContent += `<div class="space-y-3">
                                <p><strong>Flesch-Kincaid Reading Ease:</strong> <span class="font-semibold text-blue-700">${score}</span></p>
                                <p><strong>Estimated US Grade Level:</strong> <span class="font-semibold text-blue-700">${grade}</span></p>
                                <p><strong>Penjelasan:</strong> ${explanation}</p>
                            </div>`;
    } else { // Handle plain text results potentially containing evidence
        let processedResult = { mainContent: content, quoteHtml: '' };
        if (typeof content === 'string' && (title === "Main Idea" || title === "Author's Tone" || title === "Author's Purpose")) {
            processedResult = formatEvidenceQuote(content);
            evidenceHtml = processedResult.quoteHtml;
        }
        // Apply formatting LAST
        const finalContent = applyFinalFormatting(processedResult.mainContent);
        formattedContent += finalContent;
    }

    // Assemble card content, adding evidence at the end if present
    card.innerHTML = `<h2 class="text-2xl font-bold text-blue-700 mb-4">${resultTitle}</h2><div class="text-gray-700 leading-relaxed space-y-4">${formattedContent}</div>${evidenceHtml}`;


    const showInferenceBtn = card.querySelector('#show-inference-btn');
    if (showInferenceBtn) { showInferenceBtn.addEventListener('click', () => { const revealSection = card.querySelector('#inference-reveal'); if (revealSection) { revealSection.classList.remove('hidden'); showInferenceBtn.classList.add('hidden'); } }); }

    if (title === "Author's Tone") {
        const rewriteSection = document.createElement('div'); rewriteSection.className = 'mt-6 pt-6 border-t border-gray-200'; rewriteSection.innerHTML = `<h3 class="text-lg font-semibold text-gray-800 mb-3">Rewrite Text in a New Tone</h3><div class="space-y-3" id="rewrite-controls-container"><select id="card-tone-category-select" class="w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800"><option value="">-- Select Tone Category --</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="neutral">Neutral</option><option value="custom">Custom</option></select><select id="card-positive-tones-select" class="hidden w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800"><option value="Joyful">Joyful</option><option value="Enthusiastic">Enthusiastic</option><option value="Hopeful">Hopeful</option><option value="Optimistic">Optimistic</option><option value="Friendly">Friendly</option></select><select id="card-negative-tones-select" class="hidden w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800"><option value="Sad">Sad</option><option value="Angry">Angry</option><option value="Critical">Critical</option><option value="Pessimistic">Pessimistic</option><option value="Skeptical">Skeptical</option></select><select id="card-neutral-tones-select" class="hidden w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800"><option value="Formal">Formal</option><option value="Objective">Objective</option><option value="Informative">Informative</option><option value="Analytical">Analytical</option><option value="Neutral">Neutral</option></select><div id="card-custom-tone-input-container" class="hidden"><label for="card-tone-rewrite-input" class="block text-sm font-medium text-gray-600 mb-1">Enter custom tone:</label><input type="text" id="card-tone-rewrite-input" class="w-full p-2 border border-blue-300 rounded-lg bg-blue-100 text-gray-800 placeholder-gray-500" placeholder="e.g., sarcastic, whimsical"></div><button id="rewrite-tone-btn" class="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-transform duration-200 transform hover:scale-105">Rewrite Text</button></div><div id="rewrite-result-container" class="mt-4"></div>`; card.appendChild(rewriteSection);
        const categorySelect = card.querySelector('#card-tone-category-select'); const positiveSelect = card.querySelector('#card-positive-tones-select'); const negativeSelect = card.querySelector('#card-negative-tones-select'); const neutralSelect = card.querySelector('#card-neutral-tones-select'); const customInput = card.querySelector('#card-custom-tone-input-container'); const rewriteBtn = card.querySelector('#rewrite-tone-btn'); const rewriteResultContainer = card.querySelector('#rewrite-result-container');
        categorySelect.addEventListener('change', () => { const category = categorySelect.value; positiveSelect.classList.toggle('hidden', category !== 'positive'); negativeSelect.classList.toggle('hidden', category !== 'negative'); neutralSelect.classList.toggle('hidden', category !== 'neutral'); customInput.classList.toggle('hidden', category !== 'custom'); });
        rewriteBtn.addEventListener('click', async () => {
            let desiredTone = ""; const category = categorySelect.value; if (category === 'positive') desiredTone = positiveSelect.value; else if (category === 'negative') desiredTone = negativeSelect.value; else if (category === 'neutral') desiredTone = neutralSelect.value; else if (category === 'custom') desiredTone = card.querySelector('#card-tone-rewrite-input').value.trim();
            if (desiredTone && lastAnalyzedText) { rewriteResultContainer.innerHTML = `<div class="text-center p-4 border rounded-lg bg-blue-50"><div class="flex justify-center items-center space-x-2"><div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: -0.3s;"></div><div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: -0.15s;"></div><div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div></div><p class="mt-3 text-gray-600 text-sm">Rewriting text...</p></div>`; rewriteBtn.disabled = true; const aiContent = await fetchToneRewrite(lastAnalyzedText, desiredTone); if (aiContent) { let formattedRewrite = applyFinalFormatting(aiContent).replace(/\[ORIGINAL\](.*?)\[\/ORIGINAL\]/g, '<span class="block mt-2"><span class="font-medium text-red-700">Original:</span> <span class="bg-red-100 text-red-900 p-1 rounded font-mono">"$1"</span></span>').replace(/\[MENJADI\](.*?)\[\/MENJADI\]/g, '<span class="block mb-2"><span class="font-medium text-green-700">Menjadi:</span> <span class="bg-green-100 text-green-900 p-1 rounded font-mono">"$1"</span></span>'); rewriteResultContainer.innerHTML = `<h4 class="text-md font-semibold text-blue-600 mb-2">Rewritten Text (Tone: ${desiredTone})</h4><div class="text-gray-700 leading-relaxed space-y-4 p-4 border rounded-lg bg-blue-50/50">${formattedRewrite}</div>`; } else { rewriteResultContainer.innerHTML = `<div class="bg-red-100 border border-red-200 text-red-700 p-3 rounded-lg" role="alert"><p>Error rewriting text.</p></div>`; } rewriteBtn.disabled = false; } else { rewriteResultContainer.innerHTML = `<p class="text-red-600 text-sm">Please select a tone.</p>`; }
        });
    }

    resultsContainer.appendChild(card);
}

function displayError(message) {
    resultsContainer.innerHTML = `<div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg" role="alert"><p class="font-bold">An error occurred</p><p>${message}</p></div>`;
}


async function fetchToneRewrite(text, desiredTone) {
    const apiKey = "AIzaSyCFx0aN9Z7UaZDbH1WxaT2ILQBSGO3uIAw"; const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const systemPrompt = `You are an expert creative writer and editor. Your task is to rewrite the provided text to match a new, specified tone. Format response: **Rewritten Text** [Rewritten text] **Penjelasan Perubahan (Explanation of Changes)** [Explanation in Indonesian] **Perubahan Utama (Key Changes)** * [ORIGINAL]original[/ORIGINAL] * [MENJADI]rewritten[/MENJADI]. Avoid asterisks for emphasis.`;
    const userPrompt = `ORIGINAL TEXT: """${text}"""\n\nTARGET TONE: "${desiredTone}"`; const payload = { contents: [{ parts: [{ text: userPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { temperature: 0.0 } };
    let response; let retries = 0; const maxRetries = 3; let delay = 1000;
    while (retries < maxRetries) { try { response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (response.ok) break; if (response.status === 429 || response.status >= 500) { await new Promise(resolve => setTimeout(resolve, delay)); delay *= 2; retries++; } else { throw new Error(`API Error: ${response.statusText} (${response.status})`); } } catch (error) { if (!error.message.startsWith('API Error')) { await new Promise(resolve => setTimeout(resolve, delay)); delay *= 2; retries++; } else { console.error("Non-retryable API error:", error); break; } } }
    if (!response || !response.ok) { console.error("Error calling Gemini API:", response ? `${response.status} ${response.statusText}` : "No response/network error"); return null; } try { const result = await response.json(); return result.candidates?.[0]?.content?.parts?.[0]?.text || null; } catch (error) { console.error("Error processing API response:", error); return null; }
}

async function getAIAnalysis(text, task, additionalInput = "") {
    setLoading(true);
    const apiKey = "AIzaSyCFx0aN9Z7UaZDbH1WxaT2ILQBSGO3uIAw"; const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    let systemPrompt, userPrompt = text, resultTitle, displayOptions = {};

    switch (task) {
        case 'restateSentence': const selectedType = selectRestateType(); systemPrompt = selectedType.prompt; userPrompt = `TEXT: """${text}"""\n\nSENTENCE TO RESTATE: "${additionalInput}"`; resultTitle = `Restated Sentence (${selectedType.name})`; updateRestateWeights(selectedType.id); break;
        case 'wordMeaning': systemPrompt = systemPrompts.wordMeaning; if (additionalInput) { userPrompt = `TEXT: """${text}"""\n\nWORD TO ANALYZE: "${additionalInput}"`; resultTitle = "Word Meaning Analysis"; } else { userPrompt = `TEXT: """${text}"""\n\nWORD TO ANALYZE: ""`; resultTitle = "Key Vocabulary"; } break;
        case 'trueFalse': systemPrompt = systemPrompts.trueFalse; userPrompt = `TEXT: """${text}"""\n\nSTATEMENT TO EVALUATE: "${additionalInput}"`; resultTitle = resultTitles.trueFalse; break;
        case 'purpose': systemPrompt = systemPrompts.purpose; resultTitle = resultTitles.purpose; if (additionalInput) { userPrompt = `FULL TEXT: """${text}"""\n\nSPECIFIC PARAGRAPH TO ANALYZE: """${additionalInput}"""`; displayOptions.analyzedParagraph = true; } else { userPrompt = `FULL TEXT: """${text}"""\n\nSPECIFIC PARAGRAPH TO ANALYZE: ""`; } break;
        case 'summary': let sentenceCount = 3, lengthLabel = "Medium"; if (additionalInput === 'short') { sentenceCount = 1; lengthLabel = "Short"; } else if (additionalInput === 'detailed') { sentenceCount = 5; lengthLabel = "Detailed"; } systemPrompt = systemPrompts.summary(sentenceCount); userPrompt = text; resultTitle = resultTitles.summary; displayOptions.summaryLength = lengthLabel; break;
        case 'keyThemes': systemPrompt = systemPrompts.keyThemes; userPrompt = text; resultTitle = resultTitles.keyThemes; break;
        case 'readabilityScore': systemPrompt = systemPrompts.readabilityScore; userPrompt = text; resultTitle = resultTitles.readabilityScore; break;
        default: systemPrompt = systemPrompts[task]; resultTitle = resultTitles[task]; userPrompt = text; break;
    }

    const payload = { contents: [{ parts: [{ text: userPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { temperature: 0.0, ...( (task === 'inference' || task === 'wordMeaning' || task === 'trueFalse' || task === 'keyThemes') && { responseMimeType: "application/json" } ) } };
    if (task === 'inference') payload.generationConfig.responseSchema = { type: "ARRAY", items: { type: "OBJECT", properties: { "quote": { "type": "STRING" }, "clue": { "type": "STRING" }, "inference": { "type": "STRING" }, "explanation": { "type": "STRING" } }, required: ["quote", "clue", "inference", "explanation"] } };
    else if (task === 'wordMeaning') payload.generationConfig.responseSchema = { type: "ARRAY", items: { type: "OBJECT", properties: { "word": { "type": "STRING" }, "definition": { "type": "STRING" }, "quote": { "type": "STRING" }, "explanation": { "type": "STRING" } }, required: ["word", "definition", "quote", "explanation"] } };
    else if (task === 'trueFalse') payload.generationConfig.responseSchema = { type: "OBJECT", properties: { "statement": { "type": "STRING" }, "result": { "type": "STRING", "enum": ["True", "False"] }, "quote": { "type": "STRING" }, "explanation": { "type": "STRING" } }, required: ["statement", "result", "quote", "explanation"] };
    else if (task === 'keyThemes') payload.generationConfig.responseSchema = { type: "ARRAY", items: { type: "OBJECT", properties: { "theme": { "type": "STRING" }, "explanation": { "type": "STRING" } }, required: ["theme", "explanation"] } };

    let response; let retries = 0; const maxRetries = 3; let delay = 1000;
    while (retries < maxRetries) { try { response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (response.ok) break; if (response.status === 429 || response.status >= 500) { await new Promise(resolve => setTimeout(resolve, delay)); delay *= 2; retries++; } else { throw new Error(`API Error: ${response.statusText} (${response.status})`); } } catch (error) { if (error.message.startsWith('API Error')) { console.error("Non-retryable API error:", error); displayError(`Analysis failed: ${error.message}.`); setLoading(false); return; } await new Promise(resolve => setTimeout(resolve, delay)); delay *= 2; retries++; } }
    if (!response || !response.ok) { console.error("Error calling Gemini API:", response ? `${response.status} ${response.statusText}` : "No response/network error"); let errorMsg = "Analysis failed after multiple attempts."; if(response){ try { const errorBody = await response.json(); errorMsg = `API Error (${response.status}): ${errorBody?.error?.message || response.statusText}.`; } catch(e) { errorMsg = `API Error (${response.status}): ${response.statusText}.`; }} displayError(errorMsg); setLoading(false); return; }

    try {
        const result = await response.json();
        if (!result.candidates?.length || !result.candidates[0].content?.parts?.length) { let finishReason = result.candidates?.[0]?.finishReason; let safetyRatings = result.candidates?.[0]?.safetyRatings; console.warn("API returned no valid content.", finishReason, safetyRatings); let errorReason = "The AI response was empty."; if (finishReason === "SAFETY") errorReason = "Blocked due to safety concerns."; else if (finishReason === "RECITATION") errorReason = "Blocked due to recitation issues."; else if (finishReason) errorReason = `Stopped unexpectedly (${finishReason}).`; displayError(errorReason); setLoading(false); return; }
        const aiText = result.candidates[0].content.parts[0].text; if (!aiText) { throw new Error("AI returned empty response part."); }

        if (task === 'wordMeaning' || task === 'inference' || task === 'trueFalse' || task === 'keyThemes') {
            let parsedData; let parseError = null;
            try { parsedData = JSON.parse(aiText); if ((task === 'wordMeaning' || task === 'inference' || task === 'keyThemes') && (!Array.isArray(parsedData) || parsedData.length === 0)) throw new Error("Expected array."); if (task === 'trueFalse' && (typeof parsedData !== 'object' || parsedData === null)) throw new Error("Expected object."); }
            catch (error) { console.error(`Failed JSON parse for '${task}':`, error, "\nRaw:", aiText); parseError = error; }
            if (!parseError) {
                if (task === 'wordMeaning') { vocabList = parsedData; lastAnalyzedTextForVocab = text; currentVocabIndex = 0; let title = vocabList.length > 1 ? `Key Vocabulary (${currentVocabIndex + 1} of ${vocabList.length})` : "Word Meaning Analysis"; displayResult(title, vocabList[0]); }
                else if (task === 'inference') { inferenceList = parsedData; lastAnalyzedTextForInference = text; currentInferenceIndex = 0; const title = `Inference (${currentInferenceIndex + 1} of ${inferenceList.length})`; displayResult(title, inferenceList[0]); }
                else if (task === 'keyThemes') { displayResult(resultTitle, parsedData, displayOptions); } // Pass the whole array to displayResult
                else { displayResult(resultTitle, parsedData, displayOptions); }
            } else { displayResult(resultTitles[task] || "Result", aiText, { isFallback: true }); }
        } else if (task === 'mainIdea') {
            mainIdeaList = aiText.split('|||').map(item => item.trim()).filter(item => item !== ''); lastAnalyzedTextForMainIdea = text;
            if (mainIdeaList.length > 0) { currentMainIdeaIndex = 0; displayResult(resultTitle, mainIdeaList[0], displayOptions); }
            else { displayResult(resultTitle, "Could not find distinct main ideas.", displayOptions); }
        } else { displayResult(resultTitle, aiText, displayOptions); }
    } catch (error) { console.error("Error processing response:", error); displayError(`Issue processing response: ${error.message}.`);
    } finally { setLoading(false); }
}
