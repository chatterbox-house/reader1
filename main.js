import { openDB } from 'idb';
import { v4 as uuidv4 } from 'uuid';

let db;
let sentences = [];
let current = 0;
let vocab = [];
let reviewIndex = 0;
let currentReview = null;

// === DB Setup ===
async function initDB() {
  db = await openDB('jp-reader', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sentences')) {
        db.createObjectStore('sentences', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('vocab')) {
        db.createObjectStore('vocab', { keyPath: 'id' });
      }
    }
  });
}

// === Sentence Handling ===
function splitText(text) {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'sentence' });
  return Array.from(segmenter.segment(text)).map(seg => seg.segment.trim()).filter(s => s.length > 1);
}

function showSentence(index) {
  const s = sentences[index];
  document.getElementById('sentence-display').textContent = s.original;
  document.getElementById('user-translation').value = s.user_translation || '';
}

// === Event Bindings ===
document.getElementById('process-btn').onclick = async () => {
  const raw = document.getElementById('text-input').value;
  const parts = splitText(raw).slice(0, 500);
  sentences = await Promise.all(parts.map((text, i) => {
    const obj = { id: uuidv4(), original: text, user_translation: '', position: i };
    db.put('sentences', obj);
    return obj;
  }));
  current = 0;
  document.getElementById('import-screen').hidden = true;
  document.getElementById('reader-screen').hidden = false;
  showSentence(current);
};

document.getElementById('next-btn').onclick = () => {
  if (current < sentences.length - 1) {
    current++;
    showSentence(current);
  }
};

document.getElementById('prev-btn').onclick = () => {
  if (current > 0) {
    current--;
    showSentence(current);
  }
};

document.getElementById('tts-btn').onclick = () => {
  const utter = new SpeechSynthesisUtterance(sentences[current].original);
  utter.lang = 'ja-JP';
  utter.rate = 0.8;
  speechSynthesis.speak(utter);
};

document.getElementById('save-translation').onclick = () => {
  const val = document.getElementById('user-translation').value;
  sentences[current].user_translation = val;
  db.put('sentences', sentences[current]);
};

document.getElementById('add-to-review').onclick = () => {
  const sel = window.getSelection().toString().trim();
  if (sel) {
    const word = {
      id: uuidv4(),
      word: sel,
      translation: '',
      sentence_id: sentences[current].id,
      bucket: 'new',
      streak: 0,
      lastSeen: Date.now()
    };
    db.put('vocab', word);
    alert('追加: ' + sel);
  }
};

document.getElementById('to-reader').onclick = async () => {
  sentences = await db.getAll('sentences');
  sentences.sort((a, b) => a.position - b.position);
  current = 0;
  document.getElementById('reader-screen').hidden = false;
  document.getElementById('review-screen').hidden = true;
  showSentence(current);
};

document.getElementById('to-review').onclick = async () => {
  vocab = await db.getAll('vocab');
  vocab = vocab.filter(v => v.bucket !== 'retired');
  reviewIndex = 0;
  showReviewItem();
  document.getElementById('reader-screen').hidden = true;
  document.getElementById('review-screen').hidden = false;
};

document.getElementById('review-next').onclick = () => {
  if (document.getElementById('hard-answer').hidden === false) {
    checkHardAnswer();
  } else {
    reviewIndex++;
    showReviewItem();
  }
};

document.getElementById('toggle-theme').onclick = () => {
  document.body.classList.toggle('light');
};

function showReviewItem() {
  if (reviewIndex >= vocab.length) {
    document.getElementById('quiz-box').innerHTML = '完了！';
    return;
  }

  const mode = document.getElementById('mode-select').value;
  const item = vocab[reviewIndex];
  currentReview = item;

  const quizBox = document.getElementById('quiz-box');
  const hardInput = document.getElementById('hard-answer');
  hardInput.hidden = true;

  if (mode === 'easy') {
    const utter = new SpeechSynthesisUtterance(item.word);
    utter.lang = 'ja-JP';
    utter.rate = 0.8;
    speechSynthesis.speak(utter);
    quizBox.innerHTML = `意味: <strong>${item.translation || '（訳を設定してください）'}</strong>`;
  } else if (mode === 'medium') {
    quizBox.innerHTML = `意味: <strong>${item.translation || '（訳を設定してください）'}</strong>`;
    if (Math.random() < 0.5) {
      const utter = new SpeechSynthesisUtterance(item.word);
      utter.lang = 'ja-JP';
      utter.rate = 0.8;
      speechSynthesis.speak(utter);
    }
  } else if (mode === 'hard') {
    quizBox.innerHTML = `意味: <strong>${item.translation || '（訳を設定してください）'}</strong><br>入力してください：`;
    hardInput.hidden = false;
    hardInput.value = '';
    hardInput.focus();
  }
}

function checkHardAnswer() {
  const input = document.getElementById('hard-answer').value.trim();
  const correct = currentReview.word.trim();
  const match = input === correct;
  updateVocabStats(currentReview, match);
  reviewIndex++;
  showReviewItem();
}

async function updateVocabStats(item, correct) {
  item.streak = correct ? item.streak + 1 : 0;

  if (!correct) {
    item.bucket = 'hard';
  } else if (item.streak >= 3) {
    if (item.bucket === 'new') item.bucket = 'easy';
    else if (item.bucket === 'easy') item.bucket = 'medium';
    else if (item.bucket === 'medium') item.bucket = 'retired';
  }

  item.lastSeen = Date.now();
  await db.put('vocab', item);
}

// Init
initDB();
