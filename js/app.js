'use strict';

/* =========================================================
   SONIQ v5.2
   YouTube + Vercel API + Mobile First
========================================================= */

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];


/* =========================================================
   CONFIG
========================================================= */

/*
  SAME VERCEL PROJECT:
  const API_BASE = '';

  GITHUB PAGES + VERCEL API:
  Example:
  const API_BASE = 'https://your-project.vercel.app';
*/

const API_BASE = '';

const API_ENDPOINT = '/api/search';

const DEFAULT_ART =
  './assets/images/openbeat-default.svg';


/* =========================================================
   DATA
========================================================= */

const GENRES = [
  'Trending music',
  'Bollywood hits',
  'Punjabi songs',
  'Romantic Hindi songs',
  'Lo-fi chill music',
  'Workout music',
  '90s Hindi songs'
];

const PLAYLISTS = [
  ['Today’s Top Hits', 'today top music hits'],
  ['Bollywood Hits', 'latest bollywood songs'],
  ['Punjabi Party', 'popular punjabi songs'],
  ['Romantic Vibes', 'romantic hindi songs'],
  ['Lo-Fi & Chill', 'lofi chill music']
];


/* =========================================================
   STATE
========================================================= */

let ytReady = false;
let yt = null;

let current = null;

let queue = [];
let idx = -1;

let fav = [];
let recent = [];
let history = [];

let repeat = false;
let shuffle = false;
let muted = false;

let searchTimer = null;
let progressTimer = null;

let deferredInstall = null;

let apiRequestId = 0;
let playerCreationId = 0;


/* =========================================================
   LOCAL STORAGE
========================================================= */

function readArray(key) {

  try {

    const raw =
      localStorage.getItem(key);

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? normalizeSongs(parsed)
      : [];

  } catch (error) {

    console.warn(
      `SONIQ storage read failed: ${key}`,
      error
    );

    return [];
  }
}


function writeArray(key, value) {

  try {

    localStorage.setItem(
      key,
      JSON.stringify(
        Array.isArray(value)
          ? value
          : []
      )
    );

  } catch (error) {

    console.warn(
      `SONIQ storage write failed: ${key}`,
      error
    );
  }
}


fav =
  readArray('ob5fav');

recent =
  readArray('ob5recent');

history =
  readArray('ob5history');


function save() {

  writeArray(
    'ob5fav',
    fav
  );

  writeArray(
    'ob5recent',
    recent
  );

  writeArray(
    'ob5history',
    history
  );
}


/* =========================================================
   YOUTUBE API
========================================================= */

window.onYouTubeIframeAPIReady =
  function () {

    ytReady = true;

    if (
      current &&
      current.id &&
      $('#youtubePlayer')
    ) {

      createYouTubePlayer(
        current.id
      );
    }
  };


/* =========================================================
   HELPERS
========================================================= */

function esc(value) {

  return String(
    value ?? ''
  ).replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char])
  );
}


function normalizeSong(song) {

  if (
    !song ||
    typeof song !== 'object'
  ) {
    return null;
  }

  const id =
    String(
      song.id ||
      song.videoId ||
      ''
    ).trim();

  if (!id) {
    return null;
  }

  return {

    id,

    title:
      String(
        song.title ||
        'Unknown song'
      ),

    channel:
      String(
        song.channel ||
        song.artist ||
        'Unknown artist'
      ),

    thumbnail:
      String(
        song.thumbnail ||
        song.thumbnailUrl ||
        DEFAULT_ART
      )

  };
}


function normalizeSongs(items) {

  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map(normalizeSong)
    .filter(Boolean);
}


function safeImage(
  element,
  source
) {

  if (!element) {
    return;
  }

  const fallback =
    DEFAULT_ART;

  element.onerror =
    function () {

      if (
        element.dataset.fallbackApplied ===
        '1'
      ) {
        return;
      }

      element.dataset.fallbackApplied =
        '1';

      element.src =
        fallback;
    };

  element.src =
    source ||
    fallback;
}


function toast(message) {

  const element =
    $('#toast');

  if (!element) {
    return;
  }

  element.textContent =
    String(
      message || ''
    );

  element.classList.add(
    'show'
  );

  clearTimeout(
    element._toastTimer
  );

  element._toastTimer =
    setTimeout(
      () => {

        element.classList.remove(
          'show'
        );

      },
      2200
    );
}


function uniqueSongs(items) {

  const map =
    new Map();

  normalizeSongs(items)
    .forEach(song => {

      if (
        !map.has(song.id)
      ) {

        map.set(
          song.id,
          song
        );
      }

    });

  return [
    ...map.values()
  ];
}


/* =========================================================
   MOBILE MENU
========================================================= */

function openSide() {

  document.body.classList.add(
    'side-open'
  );

  document.body.classList.add(
    'menu-open'
  );

  if (
    window.innerWidth <= 800
  ) {

    document.body.style.overflow =
      'hidden';
  }
}


function closeSide() {

  document.body.classList.remove(
    'side-open'
  );

  document.body.classList.remove(
    'menu-open'
  );

  document.body.style.overflow =
    '';
}


function toggleSide() {

  if (
    document.body.classList.contains(
      'side-open'
    )
  ) {

    closeSide();

  } else {

    openSide();
  }
}


/* =========================================================
   VIEW ROUTING
========================================================= */

function showView(
  view,
  updateHash = true
) {

  const views = [
    'home',
    'search',
    'library',
    'recent'
  ];

  const selected =
    views.includes(view)
      ? view
      : 'home';


  views.forEach(name => {

    const element =
      $(`#${name}View`);

    if (!element) {
      return;
    }

    element.classList.toggle(
      'hidden',
      name !== selected
    );

  });


  $$('.nav')
    .forEach(button => {

      button.classList.toggle(
        'active',
        button.dataset.view ===
          selected
      );

    });


  closeSide();


  if (
    updateHash &&
    location.hash !==
      `#${selected}View`
  ) {

    history.replaceState(
      null,
      '',
      `#${selected}View`
    );
  }


  if (
    selected === 'library'
  ) {

    renderLibrary();
  }


  if (
    selected === 'recent'
  ) {

    renderRecent();
  }


  if (
    selected === 'search'
  ) {

    renderSearchSuggestions();
  }
}


function viewFromHash() {

  const hash =
    location.hash
      .replace('#', '')
      .replace('View', '')
      .trim();

  return [
    'home',
    'search',
    'library',
    'recent'
  ].includes(hash)
    ? hash
    : 'home';
}


/* =========================================================
   API
========================================================= */

function getApiUrl(query) {

  const cleanBase =
    String(
      API_BASE || ''
    ).replace(
      /\/+$/,
      ''
    );

  return (
    cleanBase +
    API_ENDPOINT +
    `?q=${encodeURIComponent(query)}`
  );
}


async function api(query) {

  const cleanQuery =
    String(
      query || ''
    ).trim();

  if (!cleanQuery) {

    throw new Error(
      'Search query is empty.'
    );
  }


  const requestNumber =
    ++apiRequestId;


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => controller.abort(),
      15000
    );


  try {

    const response =
      await fetch(
        getApiUrl(
          cleanQuery
        ),
        {
          method: 'GET',

          headers: {
            Accept:
              'application/json'
          },

          signal:
            controller.signal
        }
      );


    let data = null;


    try {

      data =
        await response.json();

    } catch {

      throw new Error(
        'API returned an invalid response.'
      );
    }


    if (!response.ok) {

      throw new Error(
        data?.error ||
        data?.message ||
        `API request failed (${response.status})`
      );
    }


    if (
      requestNumber !==
      apiRequestId
    ) {

      return {
        items: [],
        stale: true
      };
    }


    return {

      ...data,

      items:
        normalizeSongs(
          data?.items
        )

    };

  } catch (error) {

    if (
      error?.name ===
      'AbortError'
    ) {

      throw new Error(
        'Request timed out. Please try again.'
      );
    }


    if (
      error instanceof TypeError
    ) {

      throw new Error(
        'Unable to connect to the music API.'
      );
    }


    throw error;

  } finally {

    clearTimeout(
      timeout
    );
  }
}


/* =========================================================
   SONG CARD
========================================================= */

function songCard(
  song,
  index
) {

  const liked =
    fav.some(
      item =>
        item.id === song.id
    );

  const playing =
    current?.id === song.id;


  return `
    <article
      class="song ${playing ? 'is-current' : ''}"
      data-index="${index}"
      tabindex="0"
      role="button"
      aria-label="Play ${esc(song.title)}"
    >

      <div class="cover">

        <img
          loading="lazy"
          src="${esc(song.thumbnail || DEFAULT_ART)}"
          alt="${esc(song.title)}"
        >

        <button
          class="play"
          type="button"
          aria-label="Play ${esc(song.title)}"
        >▶</button>

        <button
          class="add"
          type="button"
          aria-label="Add ${esc(song.title)} to queue"
        >＋</button>

      </div>

      <b>${esc(song.title)}</b>

      <span>${esc(song.channel)}</span>

    </article>
  `;
}


/* =========================================================
   SONG RENDER
========================================================= */

function renderSongs(
  element,
  items
) {

  if (!element) {
    return;
  }


  const songs =
    normalizeSongs(items);


  if (!songs.length) {

    element.innerHTML =
      '<p class="empty">Nothing here yet.</p>';

    return;
  }


  element.innerHTML =
    songs
      .map(songCard)
      .join('');


  const cards =
    [
      ...element.querySelectorAll(
        '.song'
      )
    ];


  cards.forEach(card => {

    const index =
      Number(
        card.dataset.index
      );

    const song =
      songs[index];


    if (!song) {
      return;
    }


    const activate =
      event => {

        if (
          event.target.closest('.add')
        ) {

          event.stopPropagation();

          addToQueue(song);

          return;
        }


        play(song);
      };


    card.addEventListener(
      'click',
      activate
    );


    card.addEventListener(
      'keydown',
      event => {

        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {

          event.preventDefault();

          activate(event);
        }

      }
    );


    const image =
      card.querySelector('img');

    if (image) {

      image.addEventListener(
        'error',
        () => {

          image.src =
            DEFAULT_ART;

        },
        {
          once: true
        }
      );

    }

  });
}


/* =========================================================
   QUEUE
========================================================= */

function addToQueue(song) {

  const normalized =
    normalizeSong(song);

  if (!normalized) {
    return;
  }


  if (
    queue.some(
      item =>
        item.id ===
        normalized.id
    )
  ) {

    toast(
      'Already in queue'
    );

    return;
  }


  queue.push(
    normalized
  );

  renderQueue();

  toast(
    'Added to queue'
  );
}


function renderQueue() {

  const count =
    $('#queueCount');

  const list =
    $('#queueList');


  if (count) {

    count.textContent =
      String(
        queue.length
      );
  }


  if (!list) {
    return;
  }


  if (!queue.length) {

    list.innerHTML =
      '<p class="empty">Your queue is empty.</p>';

    return;
  }


  list.innerHTML =
    queue
      .slice(0, 50)
      .map(
        (song, position) => `
          <button
            class="queue-item ${position === idx ? 'current' : ''}"
            type="button"
            data-index="${position}"
          >

            <img
              src="${esc(song.thumbnail || DEFAULT_ART)}"
              alt=""
            >

            <div>

              <b>
                ${
                  position === idx
                    ? '▶ '
                    : ''
                }
                ${esc(song.title)}
              </b>

              <span>
                ${esc(song.channel)}
              </span>

            </div>

          </button>
        `
      )
      .join('');


  list
    .querySelectorAll(
      '.queue-item'
    )
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          const position =
            Number(
              button.dataset.index
            );


          if (
            !Number.isInteger(
              position
            ) ||
            !queue[position]
          ) {
            return;
          }


          idx =
            position;


          play(
            queue[position]
          );

        }
      );

    });
}


function clearQueue() {

  queue = [];
  idx = -1;

  renderQueue();

  toast(
    'Queue cleared'
  );
}


/* =========================================================
   PLAYLISTS / GENRES
========================================================= */

function renderPlaylists() {

  const playlistGrid =
    $('#playlistGrid');


  if (playlistGrid) {

    playlistGrid.innerHTML =
      PLAYLISTS
        .map(
          (playlist, index) => `
            <button
              class="playlist"
              type="button"
              data-index="${index}"
            >

              ${esc(playlist[0])}

              <small>
                Tap to play
              </small>

            </button>
          `
        )
        .join('');


    playlistGrid
      .querySelectorAll(
        '.playlist'
      )
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            const playlist =
              PLAYLISTS[
                Number(
                  button.dataset.index
                )
              ];


            if (!playlist) {
              return;
            }


            loadQuery(
              playlist[1],
              playlist[0],
              true
            );

          }
        );

      });

  }


  const sideGenres =
    $('#sideGenres');


  if (sideGenres) {

    sideGenres.innerHTML =
      GENRES
        .map(
          genre => `
            <button
              class="genre"
              type="button"
              data-query="${esc(genre)}"
            >
              ♪ ${esc(genre)}
            </button>
          `
        )
        .join('');


    sideGenres
      .querySelectorAll(
        '.genre'
      )
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            const query =
              button.dataset.query;


            loadQuery(
              query,
              query,
              true
            );

          }
        );

      });

  }
}


/* =========================================================
   ARTISTS
========================================================= */

function renderArtists(items) {

  const element =
    $('#artistGrid');

  if (!element) {
    return;
  }


  const artists = [];


  normalizeSongs(items)
    .forEach(song => {

      if (
        song.channel &&
        !artists.some(
          item =>
            item.channel ===
            song.channel
        )
      ) {

        artists.push(
          song
        );
      }

    });


  if (!artists.length) {

    element.innerHTML =
      '<p class="empty">No artists available.</p>';

    return;
  }


  element.innerHTML =
    artists
      .slice(0, 12)
      .map(
        song => `
          <button
            class="artist"
            type="button"
            data-channel="${esc(song.channel)}"
          >

            <img
              loading="lazy"
              src="${esc(song.thumbnail || DEFAULT_ART)}"
              alt="${esc(song.channel)}"
            >

            <b>
              ${esc(song.channel)}
            </b>

          </button>
        `
      )
      .join('');


  element
    .querySelectorAll(
      '.artist'
    )
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          const channel =
            button.dataset.channel;

          if (!channel) {
            return;
          }

          loadQuery(
            channel,
            channel,
            true
          );

        }
      );

    });
}


/* =========================================================
   ARTWORK
========================================================= */

function updateArtwork(song) {

  const source =
    song?.thumbnail ||
    DEFAULT_ART;


  [
    'bigThumb',
    'miniThumb',
    'heroThumb'
  ].forEach(id => {

    safeImage(
      $('#' + id),
      source
    );

  });
}


/* =========================================================
   PLAYER UI
========================================================= */

function updatePlayerUI(song) {

  if (!song) {
    return;
  }


  [
    'nowTitle',
    'miniTitle',
    'heroNowTitle'
  ].forEach(id => {

    const element =
      $('#' + id);

    if (element) {

      element.textContent =
        song.title;
    }

  });


  [
    'nowArtist',
    'miniArtist',
    'heroNowArtist'
  ].forEach(id => {

    const element =
      $('#' + id);

    if (element) {

      element.textContent =
        song.channel;
    }

  });


  updateArtwork(song);

  updateLikeButtons();

  updateCurrentCards();
}


function updateCurrentCards() {

  $$('.song')
    .forEach(card => {

      const index =
        Number(
          card.dataset.index
        );

      const parentSongs =
        card.closest('.cards');

      if (!parentSongs) {
        return;
      }

      card.classList.toggle(
        'is-current',
        current &&
        card.querySelector('b') &&
        card.querySelector('b').textContent ===
          current.title
      );

    });
}


/* =========================================================
   LIKE
========================================================= */

function isLiked(song) {

  return Boolean(
    song &&
    fav.some(
      item =>
        item.id === song.id
    )
  );
}


function toggleLike(song) {

  if (!song) {
    return;
  }


  const existing =
    fav.findIndex(
      item =>
        item.id === song.id
    );


  if (
    existing >= 0
  ) {

    fav.splice(
      existing,
      1
    );

    toast(
      'Removed from library'
    );

  } else {

    fav.unshift(
      song
    );

    fav =
      uniqueSongs(
        fav
      ).slice(0, 200);

    toast(
      'Added to library'
    );
  }


  save();

  updateLikeButtons();

  renderLibrary();
}


function updateLikeButtons() {

  const liked =
    isLiked(current);


  [
    'likeBtn',
    'miniLike'
  ].forEach(id => {

    const button =
      $('#' + id========================================================= */

const GENRES = [
  'Trending music',
  'Bollywood hits',
  'Punjabi songs',
  'Romantic Hindi songs',
  'Lo-fi chill music',
  'Workout music',
  '90s Hindi songs'
];

const PLAYLISTS = [
  ['Today’s Top Hits', 'today top music hits'],
  ['Bollywood Hits', 'latest bollywood songs'],
  ['Punjabi Party', 'popular punjabi songs'],
  ['Romantic Vibes', 'romantic hindi songs'],
  ['Lo-Fi & Chill', 'lofi chill music']
];


/* =========================================================
   PLAYER STATE
========================================================= */

let ytReady = false;
let yt = null;

let current = null;

let queue = [];
let idx = -1;

let last = [];

let repeat = false;

let searchTimer = null;
let progressTimer = null;

let deferredInstall = null;

let apiRequestId = 0;

let playerCreationId = 0;


/* =========================================================
   LOCAL STORAGE
========================================================= */

function readArray(key) {
  try {
    const raw = localStorage.getItem(key);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];

  } catch (error) {

    console.warn(
      `SONIQ storage read failed: ${key}`,
      error
    );

    return [];
  }
}


function writeArray(key, value) {
  try {

    localStorage.setItem(
      key,
      JSON.stringify(
        Array.isArray(value) ? value : []
      )
    );

  } catch (error) {

    console.warn(
      `SONIQ storage write failed: ${key}`,
      error
    );
  }
}


let fav = readArray('ob5fav');
let recent = readArray('ob5recent');
let history = readArray('ob5history');


function save() {

  writeArray('ob5fav', fav);
  writeArray('ob5recent', recent);
  writeArray('ob5history', history);
}


/* =========================================================
   YOUTUBE API READY
========================================================= */

window.onYouTubeIframeAPIReady = function () {

  ytReady = true;

  if (current && current.id) {
    createYouTubePlayer(current.id);
  }
};


/* =========================================================
   HELPERS
========================================================= */

function esc(value) {

  return String(value ?? '').replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char])
  );
}


function normalizeSong(song) {

  if (!song || typeof song !== 'object') {
    return null;
  }

  const id = String(
    song.id ||
    song.videoId ||
    ''
  ).trim();

  if (!id) {
    return null;
  }

  return {
    id,
    title: String(
      song.title ||
      'Unknown song'
    ),

    channel: String(
      song.channel ||
      song.artist ||
      'Unknown artist'
    ),

    thumbnail:
      song.thumbnail ||
      song.thumbnailUrl ||
      DEFAULT_ART
  };
}


function normalizeSongs(items) {

  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map(normalizeSong)
    .filter(Boolean);
}


function safeImage(element, source) {

  if (!element) {
    return;
  }

  const fallback =
    DEFAULT_ART;

  element.onerror = function () {

    if (element.src.includes(fallback)) {
      return;
    }

    element.src = fallback;
  };

  element.src =
    source ||
    fallback;
}


function toast(message) {

  const element = $('#toast');

  if (!element) {
    return;
  }

  element.textContent =
    String(message || '');

  element.classList.add('show');

  clearTimeout(
    element._toastTimer
  );

  element._toastTimer =
    setTimeout(() => {

      element.classList.remove('show');

    }, 2200);
}


/* =========================================================
   MOBILE MENU
========================================================= */

function openSide() {

  document.body.classList.add(
    'side-open'
  );

  document.body.classList.add(
    'menu-open'
  );

  if (window.innerWidth <= 800) {

    document.body.style.overflow =
      'hidden';
  }
}


function closeSide() {

  document.body.classList.remove(
    'side-open'
  );

  document.body.classList.remove(
    'menu-open'
  );

  document.body.style.overflow = '';
}


function toggleSide() {

  if (
    document.body.classList.contains(
      'side-open'
    )
  ) {

    closeSide();

  } else {

    openSide();
  }
}


/* =========================================================
   API
========================================================= */

function getApiUrl(query) {

  const cleanBase =
    String(API_BASE || '')
      .replace(/\/+$/, '');

  const path =
    `${API_ENDPOINT}?q=${encodeURIComponent(query)}`;

  return cleanBase + path;
}


async function api(query) {

  const cleanQuery =
    String(query || '').trim();

  if (!cleanQuery) {
    throw new Error(
      'Search query is empty.'
    );
  }

  const requestNumber =
    ++apiRequestId;

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      15000
    );

  try {

    const response =
      await fetch(
        getApiUrl(cleanQuery),
        {
          method: 'GET',
          headers: {
            Accept:
              'application/json'
          },
          signal:
            controller.signal
        }
      );

    let data = null;

    try {

      data =
        await response.json();

    } catch {

      throw new Error(
        'API returned an invalid response.'
      );
    }

    if (!response.ok) {

      throw new Error(
        data?.error ||
        data?.message ||
        `API request failed (${response.status})`
      );
    }

    if (requestNumber !== apiRequestId) {

      return {
        items: [],
        stale: true
      };
    }

    return {
      ...data,
      items:
        normalizeSongs(data?.items)
    };

  } catch (error) {

    if (error?.name === 'AbortError') {

      throw new Error(
        'Request timed out. Please try again.'
      );
    }

    if (
      error instanceof TypeError
    ) {

      throw new Error(
        'Unable to connect to the music API.'
      );
    }

    throw error;

  } finally {

    clearTimeout(timeout);
  }
}


/* =========================================================
   SONG CARD
========================================================= */

function songCard(song, index) {

  return `
    <article
      class="song"
      data-index="${index}"
      tabindex="0"
      role="button"
      aria-label="Play ${esc(song.title)}"
    >

      <div class="cover">

        <img
          loading="lazy"
          src="${esc(song.thumbnail || DEFAULT_ART)}"
          alt="${esc(song.title)}"
          onerror="this.onerror=null;this.src='${DEFAULT_ART}'"
        >

        <button
          class="play"
          type="button"
          aria-label="Play ${esc(song.title)}"
        >▶</button>

        <button
          class="add"
          type="button"
          aria-label="Add ${esc(song.title)} to queue"
        >＋</button>

      </div>

      <b>${esc(song.title)}</b>

      <span>${esc(song.channel)}</span>

    </article>
  `;
}


/* =========================================================
   SONG RENDER
========================================================= */

function renderSongs(element, items) {

  if (!element) {
    return;
  }

  const songs =
    normalizeSongs(items);

  if (!songs.length) {

    element.innerHTML =
      '<p class="empty">Nothing here yet.</p>';

    return;
  }

  element.innerHTML =
    songs
      .map(songCard)
      .join('');


  const cards =
    [...element.querySelectorAll('.song')];


  cards.forEach(card => {

    const index =
      Number(card.dataset.index);

    const song =
      songs[index];

    if (!song) {
      return;
    }


    const activate =
      event => {

        if (
          event.target.closest('.add')
        ) {

          addToQueue(song);

          return;
        }

        play(song);
      };


    card.addEventListener(
      'click',
      activate
    );


    card.addEventListener(
      'keydown',
      event => {

        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {

          event.preventDefault();

          activate(event);
        }
      }
    );
  });
}


/* =========================================================
   QUEUE
========================================================= */

function addToQueue(song) {

  if (!song) {
    return;
  }

  if (
    queue.some(
      item => item.id === song.id
    )
  ) {

    toast(
      'Already in queue'
    );

    return;
  }

  queue.push(song);

  renderQueue();

  toast(
    'Added to queue'
  );
}


function renderQueue() {

  const count =
    $('#queueCount');

  const list =
    $('#queueList');


  if (count) {

    count.textContent =
      String(queue.length);
  }


  if (!list) {
    return;
  }


  if (!queue.length) {

    list.innerHTML =
      '<p class="empty">Your queue is empty.</p>';

    return;
  }


  list.innerHTML =
    queue
      .slice(0, 20)
      .map(
        (song, position) => `
          <button
            class="queue-item"
            type="button"
            data-index="${position}"
          >

            <img
              src="${esc(song.thumbnail || DEFAULT_ART)}"
              alt=""
              onerror="this.onerror=null;this.src='${DEFAULT_ART}'"
            >

            <div>

              <b>
                ${
                  position === idx
                    ? '▶ '
                    : ''
                }
                ${esc(song.title)}
              </b>

              <span>
                ${esc(song.channel)}
              </span>

            </div>

          </button>
        `
      )
      .join('');


  list
    .querySelectorAll('.queue-item')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          const position =
            Number(
              button.dataset.index
            );

          if (
            !Number.isInteger(position) ||
            !queue[position]
          ) {
            return;
          }

          idx =
            position;

          play(
            queue[position]
          );
        }
      );
    });
}


/* =========================================================
   PLAYLISTS / GENRES
========================================================= */

function renderPlaylists() {

  const playlistGrid =
    $('#playlistGrid');


  if (playlistGrid) {

    playlistGrid.innerHTML =
      PLAYLISTS
        .map(
          (playlist, index) => `
            <button
              class="playlist"
              type="button"
              data-index="${index}"
            >

              ${esc(playlist[0])}

              <small>
                Tap to play
              </small>

            </button>
          `
        )
        .join('');


    playlistGrid
      .querySelectorAll('.playlist')
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            const playlist =
              PLAYLISTS[
                Number(
                  button.dataset.index
                )
              ];

            if (!playlist) {
              return;
            }

            closeSide();

            loadQuery(
              playlist[1],
              playlist[0],
              true
            );
          }
        );
      });
  }


  const sideGenres =
    $('#sideGenres');


  if (sideGenres) {

    sideGenres.innerHTML =
      GENRES
        .map(
          genre => `
            <button
              class="genre"
              type="button"
              data-query="${esc(genre)}"
            >
              ♪ ${esc(genre)}
            </button>
          `
        )
        .join('');


    sideGenres
      .querySelectorAll('.genre')
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            const query =
              button.dataset.query;

            closeSide();

            loadQuery(
              query,
              query,
              true
            );
          }
        );
      });
  }
}


/* =========================================================
   ARTISTS
========================================================= */

function renderArtists(items) {

  const element =
    $('#artistGrid');

  if (!element) {
    return;
  }

  const artists = [];

  normalizeSongs(items)
    .forEach(song => {

      if (
        song.channel &&
        !artists.some(
          item =>
            item.channel ===
            song.channel
        )
      ) {

        artists.push(song);
      }
    });


  if (!artists.length) {

    element.innerHTML =
      '<p class="empty">No artists available.</p>';

    return;
  }


  element.innerHTML =
    artists
      .slice(0, 8)
      .map(
        song => `
          <button
            class="artist"
            type="button"
          >

            <img
              loading="lazy"
              src="${esc(song.thumbnail || DEFAULT_ART)}"
              alt="${esc(song.channel)}"
              onerror="this.onerror=null;this.src='${DEFAULT_ART}'"
            >

            <b>
              ${esc(song.channel)}
            </b>

          </button>
        `
      )
      .join('');
}


/* =========================================================
   ARTWORK
========================================================= */

function updateArtwork(song) {

  const source =
    song?.thumbnail ||
    DEFAULT_ART;


  [
    'bigThumb',
    'miniThumb',
    'heroThumb'
  ].forEach(id => {

    safeImage(
      $('#' + id),
      source
    );
  });
}


/* =========================================================
   PLAYER UI
========================================================= */

function updatePlayerUI(song) {

  if (!song) {
    return;
  }


  [
    'nowTitle',
    'miniTitle',
    'heroNowTitle'
  ].forEach(id => {

    const element =
      $('#' + id);

    if (element) {

      element.textContent =
        song.title;
    }
  });


  [
    'nowArtist',
    'miniArtist',
    'heroNowArtist'
  ].forEach(id => {

    const element =
      $('#' + id);

    if (element) {

      element.textContent =
        song.channel;
    }
  });


  updateArtwork(song);
}


/* =========================================================
   PLAY STATE UI
========================================================= */

function setPlayingState(isPlaying) {

  [
    'playBtn',
    'bottomPlay'
  ].forEach(id => {

    const button =
      $('#' + id);

    if (button) {

      button.textContent =
        isPlaying
          ? 'Ⅱ'
          : '▶';
    }
  });


  [
    'heroArt',
    'nowCover'
  ].forEach(id => {

    const element =
      $('#' + id);

    if (element) {

      element.classList.toggle(
        'is-playing',
        isPlaying
      );
    }
  });


  const miniArt =
    document.querySelector(
      '.mini-art'
    );

  if (miniArt) {

    miniArt.classList.toggle(
      'is-playing',
      isPlaying
    );
  }
}


/* =========================================================
   TIME
========================================================= */

function formatTime(seconds) {

  const value =
    Math.max(
      0,
      Math.floor(
        Number(seconds) || 0
      )
    );

  const minutes =
    Math.floor(
      value / 60
    );

  const secondsPart =
    String(
      value % 60
    ).padStart(2, '0');

  return `${minutes}:${secondsPart}`;
}


function stopProgress() {

  if (progressTimer) {

    clearInterval(
      progressTimer
    );

    progressTimer = null;
  }
}


function updateProgress() {

  if (!yt) {
    return;
  }

  try {

    const duration =
      Number(
        yt.getDuration()
      );

    const currentTime =
      Number(
        yt.getCurrentTime()
      );


    if (
      duration > 0 &&
      Number.isFinite(currentTime)
    ) {

      const range =
        $('#seekRange');

      if (range) {

        range.value =
          String(
            Math.min(
              1000,
              Math.max(
                0,
                Math.round(
                  currentTime /
                  duration *
                  1000
                )
              )
            )
          );
      }


      const now =
        $('#timeNow');

      const end =
        $('#timeEnd');


      if (now) {
        now.textContent =
          formatTime(
            currentTime
          );
      }


      if (end) {
        end.textContent =
          formatTime(
            duration
          );
      }
    }

  } catch {}
}


function startProgress() {

  stopProgress();

  updateProgress();

  progressTimer =
    setInterval(
      updateProgress,
      500
    );
}


/* =========================================================
   MEDIA SESSION
========================================================= */

function setupMediaSession(song) {

  if (
    !song ||
    !('mediaSession' in navigator)
  ) {
    return;
  }


  try {

    navigator.mediaSession.metadata =
      new MediaMetadata({
        title:
          song.title,

        artist:
          song.channel,

        album:
          'SONIQ',

        artwork: [
          {
            src:
              song.thumbnail ||
              DEFAULT_ART,

            sizes:
              '512x512',

            type:
              'image/jpeg'
          }
        ]
      });


    const setAction =
      (
        action,
        handler
      ) => {

        try {

          navigator.mediaSession
            .setActionHandler(
              action,
              handler
            );

        } catch {}
      };


    setAction(
      'play',
      () => {

        if (yt) {
          yt.playVideo();
        }
      }
    );


    setAction(
      'pause',
      () => {

        if (yt) {
          yt.pauseVideo();
        }
      }
    );


    setAction(
      'nexttrack',
      next
    );


    setAction(
      'previoustrack',
      prev
    );

  } catch (error) {

    console.warn(
      'Media Session:',
      error
    );
  }
}


/* =========================================================
   YOUTUBE PLAYER
========================================================= */

function destroyPlayer() {

  stopProgress();

  if (!yt) {
    return;
  }

  try {
    yt.destroy();
  } catch {}

  yt = null;
}


function createYouTubePlayer(videoId) {

  if (!videoId) {
    return;
  }


  if (
    !window.YT ||
    !window.YT.Player
  ) {

    setTimeout(
      () =>
        createYouTubePlayer(
          videoId
        ),
      300
    );

    return;
  }


  /*
    Existing player:
    do not destroy it unnecessarily.
  */

  if (yt) {

    try {

      yt.loadVideoById(
        videoId
      );

      yt.playVideo();

      return;

    } catch (error) {

      console.warn(
        'Existing YouTube player failed:',
        error
        }


  list.innerHTML =
    queue
      .slice(0, 20)
      .map(
        (song, position) => `
          <button
            class="queue-item"
            type="button"
            data-index="${position}"
          >

            <img
              src="${esc(song.thumbnail || DEFAULT_ART)}"
              alt=""
              onerror="this.onerror=null;this.src='${DEFAULT_ART}'"
            >

            <div>

              <b>
                ${
                  position === idx
                    ? '▶ '
                    : ''
                }
                ${esc(song.title)}
              </b>

              <span>
                ${esc(song.channel)}
              </span>

            </div>

          </button>
        `
      )
      .join('');


  list
    .querySelectorAll('.queue-item')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          const position =
            Number(
              button.dataset.index
            );

          if (
            !Number.isInteger(position) ||
            !queue[position]
          ) {
            return;
          }

          idx =
            position;

          play(
            queue[position]
          );
        }
      );
    });
}


/* =========================================================
   PLAYLISTS / GENRES
========================================================= */

function renderPlaylists() {

  const playlistGrid =
    $('#playlistGrid');


  if (playlistGrid) {

    playlistGrid.innerHTML =
      PLAYLISTS
        .map(
          (playlist, index) => `
            <button
              class="playlist"
              type="button"
              data-index="${index}"
            >

              ${esc(playlist[0])}

              <small>
                Tap to play
              </small>

            </button>
          `
        )
        .join('');


    playlistGrid
      .querySelectorAll('.playlist')
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            const playlist =
              PLAYLISTS[
                Number(
                  button.dataset.index
                )
              ];

            if (!playlist) {
              return;
            }

            closeSide();

            loadQuery(
              playlist[1],
              playlist[0],
              true
            );
          }
        );
      });
  }


  const sideGenres =
    $('#sideGenres');


  if (sideGenres) {

    sideGenres.innerHTML =
      GENRES
        .map(
          genre => `
            <button
              class="genre"
              type="button"
              data-query="${esc(genre)}"
            >
              ♪ ${esc(genre)}
            </button>
          `
        )
        .join('');


    sideGenres
      .querySelectorAll('.genre')
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            const query =
              button.dataset.query;

            closeSide();

            loadQuery(
              query,
              query,
              true
            );
          }
        );
      });
  }
}


/* =========================================================
   ARTISTS
========================================================= */

function renderArtists(items) {

  const element =
    $('#artistGrid');

  if (!element) {
    return;
  }

  const artists = [];

  normalizeSongs(items)
    .forEach(song => {

      if (
        song.channel &&
        !artists.some(
          item =>
            item.channel ===
            song.channel
        )
      ) {

        artists.push(song);
      }
    });


  if (!artists.length) {

    element.innerHTML =
      '<p class="empty">No artists available.</p>';

    return;
  }


  element.innerHTML =
    artists
      .slice(0, 8)
      .map(
        song => `
          <button
            class="artist"
            type="button"
          >

            <img
              loading="lazy"
              src="${esc(song.thumbnail || DEFAULT_ART)}"
              alt="${esc(song.channel)}"
              onerror="this.onerror=null;this.src='${DEFAULT_ART}'"
            >

            <b>
              ${esc(song.channel)}
            </b>

          </button>
        `
      )
      .join('');
}


/* =========================================================
   ARTWORK
========================================================= */

function updateArtwork(song) {

  const source =
    song?.thumbnail ||
    DEFAULT_ART;


  [
    'bigThumb',
    'miniThumb',
    'heroThumb'
  ].forEach(id => {

    safeImage(
      $('#' + id),
      source
    );
  });
}


/* =========================================================
   PLAYER UI
========================================================= */

function updatePlayerUI(song) {

  if (!song) {
    return;
  }


  [
    'nowTitle',
    'miniTitle',
    'heroNowTitle'
  ].forEach(id => {

    const element =
      $('#' + id);

    if (element) {

      element.textContent =
        song.title;
    }
  });


  [
    'nowArtist',
    'miniArtist',
    'heroNowArtist'
  ].forEach(id => {

    const element =
      $('#' + id);

    if (element) {

      element.textContent =
        song.channel;
    }
  });


  updateArtwork(song);
}


/* =========================================================
   PLAY STATE UI
========================================================= */

function setPlayingState(isPlaying) {

  [
    'playBtn',
    'bottomPlay'
  ].forEach(id => {

    const button =
      $('#' + id);

    if (button) {

      button.textContent =
        isPlaying
          ? 'Ⅱ'
          : '▶';
    }
  });


  [
    'heroArt',
    'nowCover'
  ].forEach(id => {

    const element =
      $('#' + id);

    if (element) {

      element.classList.toggle(
        'is-playing',
        isPlaying
      );
    }
  });


  const miniArt =
    document.querySelector(
      '.mini-art'
    );

  if (miniArt) {

    miniArt.classList.toggle(
      'is-playing',
      isPlaying
    );
  }
}


/* =========================================================
   TIME
========================================================= */

function formatTime(seconds) {

  const value =
    Math.max(
      0,
      Math.floor(
        Number(seconds) || 0
      )
    );

  const minutes =
    Math.floor(
      value / 60
    );

  const secondsPart =
    String(
      value % 60
    ).padStart(2, '0');

  return `${minutes}:${secondsPart}`;
}


function stopProgress() {

  if (progressTimer) {

    clearInterval(
      progressTimer
    );

    progressTimer = null;
  }
}


function updateProgress() {

  if (!yt) {
    return;
  }

  try {

    const duration =
      Number(
        yt.getDuration()
      );

    const currentTime =
      Number(
        yt.getCurrentTime()
      );


    if (
      duration > 0 &&
      Number.isFinite(currentTime)
    ) {

      const range =
        $('#seekRange');

      if (range) {

        range.value =
          String(
            Math.min(
              1000,
              Math.max(
                0,
                Math.round(
                  currentTime /
                  duration *
                  1000
                )
              )
            )
          );
      }


      const now =
        $('#timeNow');

      const end =
        $('#timeEnd');


      if (now) {
        now.textContent =
          formatTime(
            currentTime
          );
      }


      if (end) {
        end.textContent =
          formatTime(
            duration
          );
      }
    }

  } catch {}
}


function startProgress() {

  stopProgress();

  updateProgress();

  progressTimer =
    setInterval(
      updateProgress,
      500
    );
}


/* =========================================================
   MEDIA SESSION
========================================================= */

function setupMediaSession(song) {

  if (
    !song ||
    !('mediaSession' in navigator)
  ) {
    return;
  }


  try {

    navigator.mediaSession.metadata =
      new MediaMetadata({
        title:
          song.title,

        artist:
          song.channel,

        album:
          'SONIQ',

        artwork: [
          {
            src:
              song.thumbnail ||
              DEFAULT_ART,

            sizes:
              '512x512',

            type:
              'image/jpeg'
          }
        ]
      });


    const setAction =
      (
        action,
        handler
      ) => {

        try {

          navigator.mediaSession
            .setActionHandler(
              action,
              handler
            );

        } catch {}
      };


    setAction(
      'play',
      () => {

        if (yt) {
          yt.playVideo();
        }
      }
    );


    setAction(
      'pause',
      () => {

        if (yt) {
          yt.pauseVideo();
        }
      }
    );


    setAction(
      'nexttrack',
      next
    );


    setAction(
      'previoustrack',
      prev
    );

  } catch (error) {

    console.warn(
      'Media Session:',
      error
    );
  }
}


/* =========================================================
   YOUTUBE PLAYER
========================================================= */

function destroyPlayer() {

  stopProgress();

  if (!yt) {
    return;
  }

  try {
    yt.destroy();
  } catch {}

  yt = null;
}


function createYouTubePlayer(videoId) {

  if (!videoId) {
    return;
  }


  if (
    !window.YT ||
    !window.YT.Player
  ) {

    setTimeout(
      () =>
        createYouTubePlayer(
          videoId
        ),
      300
    );

    return;
  }


  /*
    Existing player:
    do not destroy it unnecessarily.
  */

  if (yt) {

    try {

      yt.loadVideoById(
        videoId
      );

      yt.playVideo();

      return;

    } catch (error) {

      console.warn(
        'Existing YouTube player failed:',
        error
      );

      destroyPlayer();
    }
  }


  const playerElement =
    $('#youtubePlayer');

  if (!playerElement) {
    return;
  }


  const creationId =
    ++playerCreationId;


  playerElement.innerHTML = '';


  try {

    yt =
      new YT.Player(
        'youtubePlayer',
        {
          videoId,

          playerVars: {
            autoplay: 1,
            controls: 1,
            rel: 0,
            playsinline: 1,
            modestbranding: 1
          },


          events: {

            onReady:
              event => {

                if (
                  creationId !==
                  playerCreationId
                ) {
                  return;
                }


                const volume =
                  Number(
                    $('#volume')
                      ?.value ||
                    80
                  );


                try {

                  event.target
                    .setVolume(
                      volume
                    );

                  event.target
                    .playVideo();

                  setPlayingState(
                    true
                  );

                  startProgress();

                } catch (
                  error
                ) {

                  console.warn(
                    'YouTube ready error:',
                    error
                  );
                }
              },


            onStateChange:
              event => {

                if (
                  event.data ===
                  YT.PlayerState.PLAYING
                ) {

                  setPlayingState(
                    true
                  );

                  startProgress();


                  if (
                    'mediaSession'
                    in navigator
                  ) {

                    try {

                      navigator.mediaSession
                        .playbackState =
                        'playing';

                    } catch {}
                  }

                  return;
                }


                if (
                  event.data ===
                  YT.PlayerState.PAUSED
                ) {

                  setPlayingState(
                    false
                  );

                  updateProgress();


                  if (
                    'mediaSession'
                    in navigator
                  ) {

                    try {

                      navigator.mediaSession
                        .playbackState =
                        'paused';

                    } catch {}
                  }

                  return;
                }


                if (
                  event.data ===
                  YT.PlayerState.ENDED
                ) {

                  setPlayingState(
                    false
                  );

                  stopProgress();

                  updateProgress();


                  if (repeat) {

                    if (current) {

                      play(
                        current
                      );
                    }

                  } else {

                    next();
                  }
                }
              },


            onError:
              event => {

                console.warn(
                  'YouTube player error:',
                  event.data
                );


                setPlayingState(
                  false
                );


                stopProgress();


                toast(
                  'This video cannot be played.'
                );


                setTimeout(
                  () => {

                    next();

                  },
                  700
                );
              }
          }
        }
      );

  } catch (error) {

    yt = null;

    console.error(
      'YouTube player creation failed:',
      error
    );

    toast(
      'Unable to start the player.'
    );
  }
}


/* =========================================================
   PLAY
========================================================= */

function play(song) {

  const normalized =
    normalizeSong(song);

  if (!normalized) {

    toast(
      'Invalid song.'
    );

    return;
  }


  current =
    normalized;


  const existingIndex =
    queue.findIndex(
      item =>
        item.id ===
        normalized.id
    );


  if (existingIndex >= 0) {

    idx =
      existingIndex;

  } else {

    queue.push(
      normalized
    );

    idx =
      queue.length - 1;
  }


  updatePlayerUI(
    normalized
  );


  recent = [
    normalized,
    ...recent.filter(
      item =>
        item.id !==
        normalized.id
    )
  ].slice(
    0,
    40
  );


  save();

  setLike();

  renderQueue();

  setupMediaSession(
    normalized
  );


  if (ytReady) {

    createYouTubePlayer(
      normalized.id
    );

  } else {

    setTimeout(
      () =>
        createYouTubePlayer(
          normalized.id
        ),
      400
    );
  }
}


/* =========================================================
   NEXT / PREVIOUS
========================================================= */

function next() {

  if (!queue.length) {

    toast(
      'Queue is empty.'
    );

    return;
  }


  idx =
    (idx + 1) %
    queue.length;


  play(
    queue[idx]
  );
}


function prev() {

  if (!queue.length) {

    toast(
      'Queue is empty.'
    );

    return;
  }


  idx =
    (
      idx -
      1 +
      queue.length
    ) %
    queue.length;


  play(
    queue[idx]
  );
}


/* =========================================================
   PLAY / PAUSE
========================================================= */

function toggle() {

  if (!yt) {

    if (current) {

      createYouTubePlayer(
        current.id
      );

      return;
    }


    if (last.length) {

      play(
        last[0]
      );

      return;
    }


    loadQuery(
      'popular music',
      'Trending now',
      true
    );

    return;
  }


  try {

    const state =
      yt.getPlayerState();


    if (
      state ===
      YT.PlayerState.PLAYING
    ) {

      yt.pauseVideo();

    } else {

      yt.playVideo();
    }

  } catch (
    error
  ) {

    console.warn(
      'Toggle error:',
      error
    );
  }
}


/* =========================================================
   LIKE
========================================================= */

function setLike() {

  const liked =
    Boolean(
      current &&
      fav.some(
        item =>
          item.id ===
          current.id
      )
    );


  [
    'likeBtn',
    'miniLike'
  ].forEach(id => {

    const button =
      $('#' + id);

    if (button) {

      button.textContent =
        liked
          ? '♥'
          : '♡';
    }
  });
}


function like() {

  if (!current) {

    toast(
      'Choose a song first.'
    );

    return;
  }


  const position =
    fav.findIndex(
      item =>
        item.id ===
        current.id
    );


  if (position >= 0) {

    fav.splice(
      position,
      1
    );

    toast(
      'Removed from liked songs'
    );

  } else {

    fav.unshift(
      current
    );

    toast(
      'Added to liked songs'
    );
  }


  save();

  setLike();


  const libraryView =
    $('#libraryView');


  if (
    libraryView &&
    !libraryView.classList.contains(
      'hidden'
    )
  ) {

    renderSongs(
      $('#libraryGrid'),
      fav
    );
  }
}


/* =========================================================
   VIEWS
========================================================= */

function view(viewName) {

  const validViews = [
    'home',
    'search',
    'library',
    'recent'
  ];


  if (
    !validViews.includes(
      viewName
    )
  ) {

    viewName =
      'home';
  }


  validViews.forEach(
    name => {

      const element =
        $('#' + name + 'View');

      if (element) {

        element.classList.toggle(
          'hidden',
          name !== viewName
        );
      }
    }
  );


  $$('.nav')
    .forEach(
      button => {

        button.classList.toggle(
          'active',
          button.dataset.view ===
          viewName
        );
      }
    );


  if (
    viewName ===
    'library'
  ) {

    renderSongs(
      $('#libraryGrid'),
      fav
    );
  }


  if (
    viewName ===
    'recent'
  ) {

    renderSongs(
      $('#recentGrid'),
      recent
    );
  }


  if (
    viewName ===
    'search'
  ) {

    renderHistory();
  }


  closeSide();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}


/* =========================================================
   SEARCH HISTORY
========================================================= */

function renderHistory() {

  const element =
    $('#suggestions');

  if (!element) {
    return;
  }


  element.className =
    'history';


  if (!history.length) {

    element.innerHTML =
      '';

    return;
  }


  element.innerHTML =
    history
      .map(
        query => `
          <button
            type="button"
            data-query="${esc(query)}"
          >
            ⌕ ${esc(query)}
          </button>
        `
      )
      .join('');


  element
    .querySelectorAll('button')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          doSearch(
            button.dataset.query ||
            ''
          );
        }
      );
    });
}


/* =========================================================
   LOAD QUERY
========================================================= */

async function loadQuery(
  query,
  title = 'Trending now',
  home = false
) {

  const target =
    home
      ? $('#trendingGrid')
      : $('#searchGrid');


  if (home) {

    const titleElement =
      $('#trendingTitle');

    if (titleElement) {

      titleElement.textContent =
        title;
    }

    view('home');
  }


  if (target) {

    target.innerHTML =
      '<p class="empty">Loading music…</p>';
  }


  try {

    const data =
      await api(query);


    if (data.stale) {
      return;
    }


    last =
      normalizeSongs(
        data.items
      );


    renderSongs(
      target,
      last
    );


    if (home) {

      renderSongs(
        $('#featuredGrid'),
        last.slice(
          0,
          5
        )
      );

      renderArtists(
        last
      );
    }


    queue =
      [...last];

    idx = -1;

    renderQueue();


  } catch (
    error
  ) {

    console.error(
      'SONIQ API error:',
      error
    );


    if (target) {

      target.innerHTML = `
        <p class="empty">
          ${esc(error.message)}
        </p>
      `;
    }


    toast(
      error.message
    );
  }
}


/* =========================================================
   SEARCH
========================================================= */

async function doSearch(query) {

  const cleanQuery =
    String(query || '')
      .trim();


  if (
    cleanQuery.length <
    3
  ) {

    toast(
      'Type at least 3 characters.'
    );

    return;
  }


  history = [
    cleanQuery,
    ...history.filter(
      item =>
        item.toLowerCase() !==
        cleanQuery.toLowerCase()
    )
  ].slice(
    0,
    12
  );


  save();

  view('search');


  const title =
    $('#searchTitle');

  const status =
    $('#searchStatus');

  const grid =
    $('#searchGrid');


  if (title) {

    title.textContent =
      `Results for “${cleanQuery}”`;
  }


  if (status) {

    status.textContent =
      'Searching…';
  }


  if (grid) {

    grid.innerHTML =
      '<p class="empty">Searching music…</p>';
  }


  try {

    const data =
      await api(
        cleanQuery
      );


    if (data.stale) {
      return;
    }


    last =
      normalizeSongs(
        data.items
      );


    renderSongs(
      grid,
      last
    );


    if (status) {

      status.textContent =
        `${last.length} result${
          last.length === 1
            ? ''
            : 's'
        }${
          data.cached
            ? ' • cached'
            : ''
        }`;
    }


    renderHistory();


  } catch (
    error
  ) {

    console.error(
      'SONIQ search error:',
      error
    );


    if (grid) {

      grid.innerHTML = `
        <p class="empty">
          ${esc(error.message)}
        </p>
      `;
    }


    if (status) {

      status.textContent =
        'Search unavailable';
    }


    toast(
      error.message
    );
  }
}


/* =========================================================
   EVENT HELPERS
========================================================= */

function onClick(
  selector,
  handler
) {

  const element =
    $(selector);

  if (!element) {
    return;
  }

  element.addEventListener(
    'click',
    handler
  );
}


/* =========================================================
   SEARCH FORM
========================================================= */

onClick(
  '#searchForm',
  event => {
    event.preventDefault();
  }
);


const searchForm =
  $('#searchForm');

if (searchForm) {

  searchForm.addEventListener(
    'submit',
    event => {

      event.preventDefault();

      doSearch(
        $('#searchInput')
          ?.value ||
        ''
      );
    }
  );
}


const searchInput =
  $('#searchInput');

if (searchInput) {

  searchInput.addEventListener(
    'input',
    () => {

      clearTimeout(
        searchTimer
      );


      const query =
        searchInput.value.trim();


      if (
        query.length >=
        3
      ) {

        searchTimer =
          setTimeout(
            () => {

              doSearch(
                query
              );

            },
            650
          );
      }
    }
  );
}


/* =========================================================
   NAVIGATION
========================================================= */

$$('.nav')
  .forEach(button => {

    button.addEventListener(
      'click',
      () => {

        view(
          button.dataset.view
        );
      }
    );
  });


/* =========================================================
   CLEAR HISTORY
========================================================= */

onClick(
  '#clearHistory',
  () => {

    history = [];

    save();

    renderHistory();

    toast(
      'Search history cleared.'
    );
  }
);


/* =========================================================
   NEW PLAYLIST
========================================================= */

onClick(
  '#newPlaylist',
  () => {

    toast(
      'Playlist is ready for local storage.'
    );
  }
);


/* =========================================================
   HERO
========================================================= */

onClick(
  '#heroPlay',
  () => {

    if (last.length) {

      play(
        last[0]
      );

    } else {

      loadQuery(
        'popular music',
        'Trending now',
        true
      );
    }
  }
);


/* =========================================================
   REFRESH BUTTONS
========================================================= */

$$('.see')
  .forEach(button => {

    button.addEventListener(
      'click',
      () => {

        const query =
          button.dataset.query ||
          'popular music';

        loadQuery(
          query,
          'Trending now',
          true
        );
      }
    );
  });


/* =========================================================
   PLAYER CONTROLS
========================================================= */

[
  'playBtn',
  'bottomPlay'
].forEach(id => {

  onClick(
    '#' + id,
    toggle
  );
});


[
  'prevBtn',
  'bottomPrev'
].forEach(id => {

  onClick(
    '#' + id,
    prev
  );
});


[
  'nextBtn',
  'bottomNext'
].forEach(id => {

  onClick(
    '#' + id,
    next
  );
});


/* =========================================================
   SHUFFLE
========================================================= */

[
  'shuffleBtn',
  'bottomShuffle'
].forEach(id => {

  onClick(
    '#' + id,
    () => {

      if (
        queue.length <
        2
      ) {

        toast(
          'Add more songs to shuffle.'
        );

        return;
      }


      const currentId =
        current?.id;


      for (
        let i =
          queue.length - 1;
        i > 0;
        i--
      ) {

        const random =
          Math.floor(
            Math.random() *
            (i + 1)
          );


        [
          queue[i],
          queue[random]
        ] = [
          queue[random],
          queue[i]
        ];
      }


      idx =
        queue.findIndex(
          song =>
            song.id ===
            currentId
        );


      renderQueue();

      toast(
        'Queue shuffled.'
      );
    }
  );
});


/* =========================================================
   REPEAT
========================================================= */

[
  'repeatBtn',
  'bottomRepeat'
].forEach(id => {

  onClick(
    '#' + id,
    () => {

      repeat =
        !repeat;

      toast(
        repeat
          ? 'Repeat one enabled.'
          : 'Repeat disabled.'
      );
    }
  );
});


/* =========================================================
   LIKE
========================================================= */

onClick(
  '#likeBtn',
  like
);

onClick(
  '#miniLike',
  like
);


/* =========================================================
   CLEAR QUEUE
========================================================= */

onClick(
  '#clearQueue',
  () => {

    queue = [];

    idx = -1;

    renderQueue();

    toast(
      'Queue cleared.'
    );
  }
);


/* =========================================================
   RIGHT PLAYER PANEL
========================================================= */

onClick(
  '#panelBtn',
  () => {

    document.body.classList.toggle(
      'right-open'
    );
  }
);


onClick(
  '#closePanel',
  () => {

    document.body.classList.remove(
      'right-open'
    );
  }
);


/* =========================================================
   VIDEO MODAL
========================================================= */

onClick(
  '#videoBtn',
  () => {

    if (!current) {

      toast(
        'Choose a song first.'
      );

      return;
    }


    const modal =
      $('#videoModal');

    if (modal) {

      modal.classList.remove(
        'hidden'
      );
    }
  }
);


onClick(
  '#closeVideo',
  () => {

    const modal =
      $('#videoModal');

    if (modal) {

      modal.classList.add(
        'hidden'
      );
    }
  }
);


/* =========================================================
   VOLUME
========================================================= */

const volume =
  $('#volume');

if (volume) {

  volume.addEventListener(
    'input',
    event => {

      if (!yt) {
        return;
      }

      try {

        yt.setVolume(
          Number(
            event.target.value
          )
        );

      } catch {}
    }
  );
}


/* =========================================================
   MUTE
========================================================= */

onClick(
  '#muteBtn',
  () => {

    if (!yt) {
      return;
    }


    const button =
      $('#muteBtn');


    try {

      if (
        yt.isMuted()
      ) {

        yt.unMute();

        if (button) {
          button.textContent =
            '🔊';
        }

      } else {

        yt.mute();

        if (button) {
          button.textContent =
            '🔇';
        }
      }

    } catch (
      error
    ) {

      console.warn(
        'Mute error:',
        error
      );
    }
  }
);


/* =========================================================
   SEEK
========================================================= */

const seekRange =
  $('#seekRange');

if (seekRange) {

  seekRange.addEventListener(
    'input',
    event => {

      if (!yt) {
        return;
      }


      try {

        const duration =
          Number(
            yt.getDuration()
          );


        const percentage =
          Number(
            event.target.value
          ) / 1000;


        if (
          duration >
          0
        ) {

          yt.seekTo(
            duration *
            percentage,
            true
          );
        }

      } catch {}
    }
  );
}


/* =========================================================
   MOBILE MENU
========================================================= */

onClick(
  '#menuBtn',
  event => {

    event.stopPropagation();

    toggleSide();
  }
);


onClick(
  '#closeMenu',
  event => {

    event.stopPropagation();

    closeSide();
  }
);


/*
  Fallback:
  If HTML does not have #closeMenu,
  clicking the logo's mobile close area
  is still not required for menu operation.
*/


/* =========================================================
   CLOSE MENU WHEN CLICKING OUTSIDE
========================================================= */

document.addEventListener(
  'click',
  event => {

    if (
      window.innerWidth >
      800
    ) {
      return;
    }


    if (
      !document.body.classList.contains(
        'side-open'
      )
    ) {
      return;
    }


    const sidebar =
      $('#sidebar');

    const menuButton =
      $('#menuBtn');


    if (
      sidebar &&
      !sidebar.contains(
        event.target
      ) &&
      menuButton &&
      !menuButton.contains(
        event.target
      )
    ) {

      closeSide();
    }
  }
);


/* =========================================================
   MOBILE SEARCH
========================================================= */

onClick(
  '#mobileSearch',
  () => {

    view(
      'search'
    );


    setTimeout(
      () => {

        $('#searchInput')
          ?.focus();

      },
      100
    );
  }
);


/* =========================================================
   VIEW ALL — PLAYLISTS
========================================================= */

onClick(
  '#viewPlaylists',
  () => {

    loadQuery(
      'popular music playlists',
      'Popular playlists',
      true
    );
  }
);


/* =========================================================
   VIEW ALL — ARTISTS
========================================================= */

onClick(
  '#viewArtists',
  () => {

    const artistGrid =
      $('#artistGrid');

    if (!artistGrid) {
      return;
    }


    artistGrid.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }
);


/* =========================================================
   GENERIC VIEW-ALL SUPPORT
========================================================= */

$$(
  '[data-action="view-playlists"]'
)
.forEach(button => {

  button.addEventListener(
    'click',
    () => {

      loadQuery(
        'popular music playlists',
        'Popular playlists',
        true
      );
    }
  );
});


$$(
  '[data-action="view-artists"]'
)
.forEach(button => {

  button.addEventListener(
    'click',
    () => {

      $('#artistGrid')
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
    }
  );
});


/* =========================================================
   THEME
========================================================= */

onClick(
  '#themeBtn',
  () => {

    toast(
      'Dark premium theme active.'
    );
  }
);


/* =========================================================
   PWA INSTALL
========================================================= */

window.addEventListener(
  'beforeinstallprompt',
  event => {

    event.preventDefault();

    deferredInstall =
      event;


    const button =
      $('#installBtn');


    if (button) {

      button.style.display =
        'block';
    }
  }
);


onClick(
  '#installBtn',
  async () => {

    if (!deferredInstall) {

      toast(
        'Use browser menu → Install app.'
      );

      return;
    }


    try {

      await deferredInstall.prompt();

      await deferredInstall.userChoice;

    } catch (
      error
    ) {

      console.warn(
        'PWA install:',
        error
      );

    } finally {

      deferredInstall =
        null;
    }
  }
);


/* =========================================================
   KEYBOARD
========================================================= */

document.addEventListener(
  'keydown',
  event => {

    if (
      event.key ===
      'Escape'
    ) {

      closeSide();

      $('#videoModal')
        ?.classList.add(
          'hidden'
        );

      document.body.classList.remove(
        'right-open'
      );
    }
  }
);


/* =========================================================
   RESIZE
========================================================= */

window.addEventListener(
  'resize',
  () => {

    if (
      window.innerWidth >
      800
    ) {

      closeSide();
    }
  }
);


/* =========================================================
   SERVICE WORKER
========================================================= */

if (
  'serviceWorker' in navigator
) {

  window.addEventListener(
    'load',
    () => {

      navigator.serviceWorker
        .register(
          './sw.js'
        )
        .catch(
          error => {

            console.warn(
              'Service Worker:',
              error
            );
          }
        );
    }
  );
}


/* =========================================================
   INITIALIZE
========================================================= */

function initSONIQ() {

  renderPlaylists();

  renderQueue();

  setLike();

  setPlayingState(
    false
  );


  loadQuery(
    'popular music',
    'Trending now',
    true
  );
}


if (
  document.readyState ===
  'loading'
) {

  document.addEventListener(
    'DOMContentLoaded',
    initSONIQ
  );

} else {

  initSONIQ();
}========================================================= */

const GENRES = [
  'Trending music',
  'Bollywood hits',
  'Punjabi songs',
  'Romantic Hindi songs',
  'Lo-fi chill music',
  'Workout music',
  '90s Hindi songs'
];

const PLAYLISTS = [
  ['Today’s Top Hits', 'today top music hits'],
  ['Bollywood Hits', 'latest bollywood songs'],
  ['Punjabi Party', 'popular punjabi songs'],
  ['Romantic Vibes', 'romantic hindi songs'],
  ['Lo-Fi & Chill', 'lofi chill music']
];


/* =========================================================
   PLAYER STATE
========================================================= */

let ytReady = false;
let yt = null;

let current = null;

let queue = [];
let idx = -1;

let last = [];

let repeat = false;

let searchTimer = null;
let progressTimer = null;

let deferredInstall = null;

let apiRequestId = 0;

let playerCreationId = 0;


/* =========================================================
   LOCAL STORAGE
========================================================= */

function readArray(key) {
  try {
    const raw = localStorage.getItem(key);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];

  } catch (error) {

    console.warn(
      `SONIQ storage read failed: ${key}`,
      error
    );

    return [];
  }
}


function writeArray(key, value) {
  try {

    localStorage.setItem(
      key,
      JSON.stringify(
        Array.isArray(value) ? value : []
      )
    );

  } catch (error) {

    console.warn(
      `SONIQ storage write failed: ${key}`,
      error
    );
  }
}


let fav = readArray('ob5fav');
let recent = readArray('ob5recent');
let history = readArray('ob5history');


function save() {

  writeArray('ob5fav', fav);
  writeArray('ob5recent', recent);
  writeArray('ob5history', history);
}


/* =========================================================
   YOUTUBE API READY
========================================================= */

window.onYouTubeIframeAPIReady = function () {

  ytReady = true;

  if (current && current.id) {
    createYouTubePlayer(current.id);
  }
};


/* =========================================================
   HELPERS
========================================================= */

function esc(value) {

  return String(value ?? '').replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char])
  );
}


function normalizeSong(song) {

  if (!song || typeof song !== 'object') {
    return null;
  }

  const id = String(
    song.id ||
    song.videoId ||
    ''
  ).trim();

  if (!id) {
    return null;
  }

  return {
    id,
    title: String(
      song.title ||
      'Unknown song'
    ),

    channel: String(
      song.channel ||
      song.artist ||
      'Unknown artist'
    ),

    thumbnail:
      song.thumbnail ||
      song.thumbnailUrl ||
      DEFAULT_ART
  };
}


function normalizeSongs(items) {

  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map(normalizeSong)
    .filter(Boolean);
}


function safeImage(element, source) {

  if (!element) {
    return;
  }

  const fallback =
    DEFAULT_ART;

  element.onerror = function () {

    if (element.src.includes(fallback)) {
      return;
    }

    element.src = fallback;
  };

  element.src =
    source ||
    fallback;
}


function toast(message) {

  const element = $('#toast');

  if (!element) {
    return;
  }

  element.textContent =
    String(message || '');

  element.classList.add('show');

  clearTimeout(
    element._toastTimer
  );

  element._toastTimer =
    setTimeout(() => {

      element.classList.remove('show');

    }, 2200);
}


/* =========================================================
   MOBILE MENU
========================================================= */

function openSide() {

  document.body.classList.add(
    'side-open'
  );

  document.body.classList.add(
    'menu-open'
  );

  if (window.innerWidth <= 800) {

    document.body.style.overflow =
      'hidden';
  }
}


function closeSide() {

  document.body.classList.remove(
    'side-open'
  );

  document.body.classList.remove(
    'menu-open'
  );

  document.body.style.overflow = '';
}


function toggleSide() {

  if (
    document.body.classList.contains(
      'side-open'
    )
  ) {

    closeSide();

  } else {

    openSide();
  }
}


/* =========================================================
   API
========================================================= */

function getApiUrl(query) {

  const cleanBase =
    String(API_BASE || '')
      .replace(/\/+$/, '');

  const path =
    `${API_ENDPOINT}?q=${encodeURIComponent(query)}`;

  return cleanBase + path;
}


async function api(query) {

  const cleanQuery =
    String(query || '').trim();

  if (!cleanQuery) {
    throw new Error(
      'Search query is empty.'
    );
  }

  const requestNumber =
    ++apiRequestId;

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      15000
    );

  try {

    const response =
      await fetch(
        getApiUrl(cleanQuery),
        {
          method: 'GET',
          headers: {
            Accept:
              'application/json'
          },
          signal:
            controller.signal
        }
      );

    let data = null;

    try {

      data =
        await response.json();

    } catch {

      throw new Error(
        'API returned an invalid response.'
      );
    }

    if (!response.ok) {

      throw new Error(
        data?.error ||
        data?.message ||
        `API request failed (${response.status})`
      );
    }

    if (requestNumber !== apiRequestId) {

      return {
        items: [],
        stale: true
      };
    }

    return {
      ...data,
      items:
        normalizeSongs(data?.items)
    };

  } catch (error) {

    if (error?.name === 'AbortError') {

      throw new Error(
        'Request timed out. Please try again.'
      );
    }

    if (
      error instanceof TypeError
    ) {

      throw new Error(
        'Unable to connect to the music API.'
      );
    }

    throw error;

  } finally {

    clearTimeout(timeout);
  }
}


/* =========================================================
   SONG CARD
========================================================= */

function songCard(song, index) {

  return `
    <article
      class="song"
      data-index="${index}"
      tabindex="0"
      role="button"
      aria-label="Play ${esc(song.title)}"
    >

      <div class="cover">

        <img
          loading="lazy"
          src="${esc(song.thumbnail || DEFAULT_ART)}"
          alt="${esc(song.title)}"
          onerror="this.onerror=null;this.src='${DEFAULT_ART}'"
        >

        <button
          class="play"
          type="button"
          aria-label="Play ${esc(song.title)}"
        >▶</button>

        <button
          class="add"
          type="button"
          aria-label="Add ${esc(song.title)} to queue"
        >＋</button>

      </div>

      <b>${esc(song.title)}</b>

      <span>${esc(song.channel)}</span>

    </article>
  `;
}


/* =========================================================
   SONG RENDER
========================================================= */

function renderSongs(element, items) {

  if (!element) {
    return;
  }

  const songs =
    normalizeSongs(items);

  if (!songs.length) {

    element.innerHTML =
      '<p class="empty">Nothing here yet.</p>';

    return;
  }

  element.innerHTML =
    songs
      .map(songCard)
      .join('');


  const cards =
    [...element.querySelectorAll('.song')];


  cards.forEach(card => {

    const index =
      Number(card.dataset.index);

    const song =
      songs[index];

    if (!song) {
      return;
    }


    const activate =
      event => {

        if (
          event.target.closest('.add')
        ) {

          addToQueue(song);

          return;
        }

        play(song);
      };


    card.addEventListener(
      'click',
      activate
    );


    card.addEventListener(
      'keydown',
      event => {

        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {

          event.preventDefault();

          activate(event);
        }
      }
    );
  });
}


/* =========================================================
   QUEUE
========================================================= */

function addToQueue(song) {

  if (!song) {
    return;
  }

  if (
    queue.some(
      item => item.id === song.id
    )
  ) {

    toast(
      'Already in queue'
    );

    return;
  }

  queue.push(song);

  renderQueue();

  toast(
    'Added to queue'
  );
}


function renderQueue() {

  const count =
    $('#queueCount');

  const list =
    $('#queueList');


  if (count) {

    count.textContent =
      String(queue.length);
  }


  if (!list) {
    return;
  }


  if (!queue.length) {

    list.innerHTML =
      '<p class="empty">Your queue is empty.</p>';

    return;
  }


  list.innerHTML =
    queue
      .slice(0, 20)
      .map(
        (song, position) => `
          <button
            class="queue-item"
            type="button"
            data-index="${position}"
          >

            <img
              src="${esc(song.thumbnail || DEFAULT_ART)}"
              alt=""
              onerror="this.onerror=null;this.src='${DEFAULT_ART}'"
            >

            <div>

              <b>
                ${
                  position === idx
                    ? '▶ '
                    : ''
                }
                ${esc(song.title)}
              </b>

              <span>
                ${esc(song.channel)}
              </span>

            </div>

          </button>
        `
      )
      .join('');


  list
    .querySelectorAll('.queue-item')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          const position =
            Number(
              button.dataset.index
            );

          if (
            !Number.isInteger(position) ||
            !queue[position]
          ) {
            return;
          }

          idx =
            position;

          play(
            queue[position]
          );
        }
      );
    });
}


/* =========================================================
   PLAYLISTS / GENRES
========================================================= */

function renderPlaylists() {

  const playlistGrid =
    $('#playlistGrid');


  if (playlistGrid) {

    playlistGrid.innerHTML =
      PLAYLISTS
        .map(
          (playlist, index) => `
            <button
              class="playlist"
              type="button"
              data-index="${index}"
            >

              ${esc(playlist[0])}

              <small>
                Tap to play
              </small>

            </button>
          `
        )
        .join('');


    playlistGrid
      .querySelectorAll('.playlist')
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            const playlist =
              PLAYLISTS[
                Number(
                  button.dataset.index
                )
              ];

            if (!playlist) {
              return;
            }

            closeSide();

            loadQuery(
              playlist[1],
              playlist[0],
              true
            );
          }
        );
      });
  }


  const sideGenres =
    $('#sideGenres');


  if (sideGenres) {

    sideGenres.innerHTML =
      GENRES
        .map(
          genre => `
            <button
              class="genre"
              type="button"
              data-query="${esc(genre)}"
            >
              ♪ ${esc(genre)}
            </button>
          `
        )
        .join('');


    sideGenres
      .querySelectorAll('.genre')
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            const query =
              button.dataset.query;

            closeSide();

            loadQuery(
              query,
              query,
              true
            );
          }
        );
      });
  }
}


/* =========================================================
   ARTISTS
========================================================= */

function renderArtists(items) {

  const element =
    $('#artistGrid');

  if (!element) {
    return;
  }

  const artists = [];

  normalizeSongs(items)
    .forEach(song => {

      if (
        song.channel &&
        !artists.some(
          item =>
            item.channel ===
            song.channel
        )
      ) {

        artists.push(song);
      }
    });


  if (!artists.length) {

    element.innerHTML =
      '<p class="empty">No artists available.</p>';

    return;
  }


  element.innerHTML =
    artists
      .slice(0, 8)
      .map(
        song => `
          <button
            class="artist"
            type="button"
          >

            <img
              loading="lazy"
              src="${esc(song.thumbnail || DEFAULT_ART)}"
              alt="${esc(song.channel)}"
              onerror="this.onerror=null;this.src='${DEFAULT_ART}'"
            >

            <b>
              ${esc(song.channel)}
            </b>

          </button>
        `
      )
      .join('');
}


/* =========================================================
   ARTWORK
========================================================= */

function updateArtwork(song) {

  const source =
    song?.thumbnail ||
    DEFAULT_ART;


  [
    'bigThumb',
    'miniThumb',
    'heroThumb'
  ].forEach(id => {

    safeImage(
      $('#' + id),
      source
    );
  });
}


/* =========================================================
   PLAYER UI
========================================================= */

function updatePlayerUI(song) {

  if (!song) {
    return;
  }


  [
    'nowTitle',
    'miniTitle',
    'heroNowTitle'
  ].forEach(id => {

    const element =
      $('#' + id);

    if (element) {

      element.textContent =
        song.title;
    }
  });


  [
    'nowArtist',
    'miniArtist',
    'heroNowArtist'
  ].forEach(id => {

    const element =
      $('#' + id);

    if (element) {

      element.textContent =
        song.channel;
    }
  });


  updateArtwork(song);
}


/* =========================================================
   PLAY STATE UI
========================================================= */

function setPlayingState(isPlaying) {

  [
    'playBtn',
    'bottomPlay'
  ].forEach(id => {

    const button =
      $('#' + id);

    if (button) {

      button.textContent =
        isPlaying
          ? 'Ⅱ'
          : '▶';
    }
  });


  [
    'heroArt',
    'nowCover'
  ].forEach(id => {

    const element =
      $('#' + id);

    if (element) {

      element.classList.toggle(
        'is-playing',
        isPlaying
      );
    }
  });


  const miniArt =
    document.querySelector(
      '.mini-art'
    );

  if (miniArt) {

    miniArt.classList.toggle(
      'is-playing',
      isPlaying
    );
  }
}


/* =========================================================
   TIME
========================================================= */

function formatTime(seconds) {

  const value =
    Math.max(
      0,
      Math.floor(
        Number(seconds) || 0
      )
    );

  const minutes =
    Math.floor(
      value / 60
    );

  const secondsPart =
    String(
      value % 60
    ).padStart(2, '0');

  return `${minutes}:${secondsPart}`;
}


function stopProgress() {

  if (progressTimer) {

    clearInterval(
      progressTimer
    );

    progressTimer = null;
  }
}


function updateProgress() {

  if (!yt) {
    return;
  }

  try {

    const duration =
      Number(
        yt.getDuration()
      );

    const currentTime =
      Number(
        yt.getCurrentTime()
      );


    if (
      duration > 0 &&
      Number.isFinite(currentTime)
    ) {

      const range =
        $('#seekRange');

      if (range) {

        range.value =
          String(
            Math.min(
              1000,
              Math.max(
                0,
                Math.round(
                  currentTime /
                  duration *
                  1000
                )
              )
            )
          );
      }


      const now =
        $('#timeNow');

      const end =
        $('#timeEnd');


      if (now) {
        now.textContent =
          formatTime(
            currentTime
          );
      }


      if (end) {
        end.textContent =
          formatTime(
            duration
          );
      }
    }

  } catch {}
}


function startProgress() {

  stopProgress();

  updateProgress();

  progressTimer =
    setInterval(
      updateProgress,
      500
    );
}


/* =========================================================
   MEDIA SESSION
========================================================= */

function setupMediaSession(song) {

  if (
    !song ||
    !('mediaSession' in navigator)
  ) {
    return;
  }


  try {

    navigator.mediaSession.metadata =
      new MediaMetadata({
        title:
          song.title,

        artist:
          song.channel,

        album:
          'SONIQ',

        artwork: [
          {
            src:
              song.thumbnail ||
              DEFAULT_ART,

            sizes:
              '512x512',

            type:
              'image/jpeg'
          }
        ]
      });


    const setAction =
      (
        action,
        handler
      ) => {

        try {

          navigator.mediaSession
            .setActionHandler(
              action,
              handler
            );

        } catch {}
      };


    setAction(
      'play',
      () => {

        if (yt) {
          yt.playVideo();
        }
      }
    );


    setAction(
      'pause',
      () => {

        if (yt) {
          yt.pauseVideo();
        }
      }
    );


    setAction(
      'nexttrack',
      next
    );


    setAction(
      'previoustrack',
      prev
    );

  } catch (error) {

    console.warn(
      'Media Session:',
      error
    );
  }
}


/* =========================================================
   YOUTUBE PLAYER
========================================================= */

function destroyPlayer() {

  stopProgress();

  if (!yt) {
    return;
  }

  try {
    yt.destroy();
  } catch {}

  yt = null;
}


function createYouTubePlayer(videoId) {

  if (!videoId) {
    return;
  }


  if (
    !window.YT ||
    !window.YT.Player
  ) {

    setTimeout(
      () =>
        createYouTubePlayer(
          videoId
        ),
      300
    );

    return;
  }


  /*
    Existing player:
    do not destroy it unnecessarily.
  */

  if (yt) {

    try {

      yt.loadVideoById(
        videoId
      );

      yt.playVideo();

      return;

    } catch (error) {

      console.warn(
        'Existing YouTube player failed:',
        error
        './assets/images/openbeat-default.svg';


/* =========================================================
   PLAYER STATE
========================================================= */

let ytReady = false;
let yt = null;

let current = null;

let queue = [];
let idx = -1;

let last = [];

let repeat = false;

let searchTimer = null;
let progressTimer = null;

let deferredInstall = null;


/* =========================================================
   LOCAL STORAGE
========================================================= */

function readArray(key) {

  try {

    const value = localStorage.getItem(key);

    if (!value) {
      return [];
    }

    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed
      : [];

  } catch (error) {

    console.warn(
      'OpenBeat storage read error:',
      error
    );

    return [];
  }
}


function writeArray(key, value) {

  try {

    localStorage.setItem(
      key,
      JSON.stringify(value)
    );

  } catch (error) {

    console.warn(
      'OpenBeat storage write error:',
      error
    );
  }
}


let fav = readArray('ob5fav');
let recent = readArray('ob5recent');
let history = readArray('ob5history');


function save() {

  writeArray('ob5fav', fav);
  writeArray('ob5recent', recent);
  writeArray('ob5history', history);
}


/* =========================================================
   SAFE HTML
========================================================= */

function esc(value) {

  return String(value ?? '').replace(
    /[&<>"']/g,
    character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[character]
  );
}


/* =========================================================
   TOAST
========================================================= */

let toastTimer = null;

function toast(message) {

  const element = $('#toast');

  if (!element) {
    return;
  }

  element.textContent = message;

  element.classList.add('show');

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {

    element.classList.remove('show');

  }, 2200);
}


/* =========================================================
   IMAGE FALLBACK
========================================================= */

function setImage(element, source) {

  if (!element) {
    return;
  }

  element.onerror = () => {

    element.onerror = null;

    element.src = DEFAULT_ART;
  };

  element.src =
    source ||
    DEFAULT_ART;
}


/* =========================================================
   YOUTUBE API READY
========================================================= */

window.onYouTubeIframeAPIReady = function () {

  ytReady = true;

  console.log(
    'OpenBeat: YouTube IFrame API ready'
  );

  if (current && current.id) {

    createPlayer(
      current.id
    );
  }
};


/* =========================================================
   API
========================================================= */

async function api(query) {

  const cleanQuery =
    String(query || '').trim();

  if (!cleanQuery) {

    throw new Error(
      'Search query is empty'
    );
  }

  const url =
    '/api/search?q=' +
    encodeURIComponent(cleanQuery);

  let response;

  try {

    response = await fetch(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        cache: 'no-store'
      }
    );

  } catch (error) {

    console.error(
      'OpenBeat network error:',
      error
    );

    throw new Error(
      'Unable to connect to the music API.'
    );
  }


  let data;

  try {

    data = await response.json();

  } catch (error) {

    console.error(
      'OpenBeat JSON error:',
      error
    );

    throw new Error(
      'Invalid API response.'
    );
  }


  if (!response.ok) {

    throw new Error(
      data?.error ||
      `API request failed (${response.status})`
    );
  }


  const items =
    Array.isArray(data?.items)
      ? data.items
      : [];


  return {
    ...data,
    items
  };
}


/* =========================================================
   SONG NORMALIZER
========================================================= */

function normalizeSong(song) {

  if (!song) {
    return null;
  }

  const id =
    String(
      song.id ||
      song.videoId ||
      ''
    ).trim();

  if (!id) {
    return null;
  }


  return {

    id,

    title:
      String(
        song.title ||
        'Unknown song'
      ),

    channel:
      String(
        song.channel ||
        song.artist ||
        'Unknown artist'
      ),

    thumbnail:
      song.thumbnail ||
      song.thumbnails?.high?.url ||
      song.thumbnails?.medium?.url ||
      song.thumbnails?.default?.url ||
      DEFAULT_ART
  };
}


/* =========================================================
   NORMALIZE LIST
========================================================= */

function normalizeSongs(items) {

  if (!Array.isArray(items)) {
    return [];
  }

  const result = [];

  items.forEach(item => {

    const song =
      normalizeSong(item);

    if (!song) {
      return;
    }

    if (
      !result.some(
        existing =>
          existing.id === song.id
      )
    ) {

      result.push(song);
    }
  });

  return result;
}


/* =========================================================
   SONG CARD
========================================================= */

function songCard(song) {

  return `
    <article
      class="song"
      data-song-id="${esc(song.id)}"
    >

      <div class="cover">

        <img
          loading="lazy"
          src="${esc(song.thumbnail || DEFAULT_ART)}"
          alt="${esc(song.title)}"
          onerror="this.onerror=null;this.src='${DEFAULT_ART}'"
        >

        <button
          class="play"
          type="button"
          aria-label="Play ${esc(song.title)}"
        >
          ▶
        </button>

        <button
          class="add"
          type="button"
          aria-label="Add ${esc(song.title)} to queue"
        >
          ＋
        </button>

      </div>

      <b>${esc(song.title)}</b>

      <span>${esc(song.channel)}</span>

    </article>
  `;
}


/* =========================================================
   RENDER SONGS
========================================================= */

function renderSongs(element, items) {

  if (!element) {
    return;
  }

  const songs =
    normalizeSongs(items);


  if (!songs.length) {

    element.innerHTML =
      '<p class="empty">Nothing here yet.</p>';

    return;
  }


  element.innerHTML =
    songs.map(songCard).join('');


  const cards =
    element.querySelectorAll('.song');


  cards.forEach((card, index) => {

    card.addEventListener(
      'click',
      event => {

        const song =
          songs[index];

        if (!song) {
          return;
        }


        const addButton =
          event.target.closest('.add');


        if (addButton) {

          addToQueue(song);

          return;
        }


        play(song);

      }
    );
  });
}


/* =========================================================
   QUEUE
========================================================= */

function addToQueue(song) {

  if (!song) {
    return;
  }


  const exists =
    queue.some(
      item =>
        item.id === song.id
    );


  if (exists) {

    toast(
      'Song is already in queue'
    );

    return;
  }


  queue.push(song);

  renderQueue();

  toast(
    'Added to queue'
  );
}


function renderQueue() {

  const count =
    $('#queueCount');

  const list =
    $('#queueList');


  if (count) {

    count.textContent =
      String(queue.length);
  }


  if (!list) {
    return;
  }


  if (!queue.length) {

    list.innerHTML =
      '<p class="empty">Your queue is empty.</p>';

    return;
  }


  list.innerHTML =
    queue
      .slice(0, 30)
      .map(
        (song, index) => `
          <div
            class="queue-item"
            data-queue-index="${index}"
          >

            <img
              src="${esc(song.thumbnail || DEFAULT_ART)}"
              alt=""
              onerror="this.onerror=null;this.src='${DEFAULT_ART}'"
            >

            <div>

              <b>
                ${
                  index === idx
                    ? '▶ '
                    : ''
                }

                ${esc(song.title)}
              </b>

              <span>
                ${esc(song.channel)}
              </span>

            </div>

          </div>
        `
      )
      .join('');


  list
    .querySelectorAll('.queue-item')
    .forEach(item => {

      item.addEventListener(
        'click',
        () => {

          const position =
            Number(
              item.dataset.queueIndex
            );

          if (
            Number.isInteger(position) &&
            queue[position]
          ) {

            idx = position;

            play(
              queue[position]
            );
          }
        }
      );
    });
}


/* =========================================================
   PLAYLISTS
========================================================= */

function renderPlaylists() {

  const playlistGrid =
    $('#playlistGrid');


  if (playlistGrid) {

    playlistGrid.innerHTML =
      PLAYLISTS
        .map(
          (playlist, index) => `
            <button
              class="playlist"
              data-i="${index}"
              type="button"
            >

              ${esc(playlist[0])}

              <small>
                Tap to play
              </small>

            </button>
          `
        )
        .join('');


    playlistGrid
      .querySelectorAll('.playlist')
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            const playlist =
              PLAYLISTS[
                Number(button.dataset.i)
              ];

            if (!playlist) {
              return;
            }

            loadQuery(
              playlist[1],
              playlist[0],
              true
            );

          }
        );
      });
  }


  const sideGenres =
    $('#sideGenres');


  if (sideGenres) {

    sideGenres.innerHTML =
      GENRES
        .map(
          genre => `
            <button
              class="genre"
              type="button"
              data-q="${esc(genre)}"
            >
              ♪ ${esc(genre)}
            </button>
          `
        )
        .join('');


    sideGenres
      .querySelectorAll('.genre')
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            const query =
              button.dataset.q;

            if (!query) {
              return;
            }

            loadQuery(
              query,
              query,
              true
            );

            closeSideMenu();

          }
        );
      });
  }
}


/* =========================================================
   ARTISTS
========================================================= */

function renderArtists(items) {

  const element =
    $('#artistGrid');


  if (!element) {
    return;
  }


  const artists = [];


  normalizeSongs(items)
    .forEach(song => {

      if (
        song.channel &&
        !artists.some(
          artist =>
            artist.channel ===
            song.channel
        )
      ) {

        artists.push(song);
      }
    });


  if (!artists.length) {

    element.innerHTML =
      '<p class="empty">No artists available.</p>';

    return;
  }


  element.innerHTML =
    artists
      .slice(0, 8)
      .map(
        song => `
          <div class="artist">

            <img
              loading="lazy"
              src="${esc(song.thumbnail || DEFAULT_ART)}"
              alt="${esc(song.channel)}"
              onerror="this.onerror=null;this.src='${DEFAULT_ART}'"
            >

            <b>
              ${esc(song.channel)}
            </b>

          </div>
        `
      )
      .join('');
}


/* =========================================================
   PLAYER ARTWORK
========================================================= */

function updateArtwork(song) {

  const source =
    song?.thumbnail ||
    DEFAULT_ART;


  setImage(
    $('#bigThumb'),
    source
  );


  setImage(
    $('#miniThumb'),
    source
  );


  setImage(
    $('#heroThumb'),
    source
  );
}


/* =========================================================
   PLAYER UI
========================================================= */

function updatePlayerUI(song) {

  if (!song) {
    return;
  }


  [
    'nowTitle',
    'miniTitle',
    'heroNowTitle'
  ]
    .forEach(id => {

      const element =
        $('#' + id);

      if (element) {

        element.textContent =
          song.title;
      }
    });


  [
    'nowArtist',
    'miniArtist',
    'heroNowArtist'
  ]
    .forEach(id => {

      const element =
        $('#' + id);

      if (element) {

        element.textContent =
          song.channel;
      }
    });


  updateArtwork(song);
}


/* =========================================================
   PLAYING ANIMATION
========================================================= */

function setPlayingState(isPlaying) {

  const playing =
    Boolean(isPlaying);


  [
    'playBtn',
    'bottomPlay'
  ]
    .forEach(id => {

      const element =
        $('#' + id);

      if (element) {

        element.textContent =
          playing
            ? 'Ⅱ'
            : '▶';
      }
    });


  const hero =
    $('#heroArt');

  if (hero) {

    hero.classList.toggle(
      'is-playing',
      playing
    );
  }


  const cover =
    $('#nowCover');

  if (cover) {

    cover.classList.toggle(
      'is-playing',
      playing
    );
  }


  const miniArt =
    document.querySelector(
      '.mini-art'
    );

  if (miniArt) {

    miniArt.classList.toggle(
      'is-playing',
      playing
    );
  }
}


/* =========================================================
   LIKE
========================================================= */

function setLike() {

  const liked =
    Boolean(
      current &&
      fav.some(
        song =>
          song.id === current.id
      )
    );


  [
    'likeBtn',
    'miniLike'
  ]
    .forEach(id => {

      const button =
        $('#' + id);

      if (button) {

        button.textContent =
          liked
            ? '♥'
            : '♡';

        button.setAttribute(
          'aria-label',
          liked
            ? 'Remove from liked songs'
            : 'Add to liked songs'
        );
      }
    });
}


function like() {

  if (!current) {

    toast(
      'Choose a song first'
    );

    return;
  }


  const index =
    fav.findIndex(
      song =>
        song.id === current.id
    );


  if (index >= 0) {

    fav.splice(
      index,
      1
    );

    toast(
      'Removed from liked songs'
    );

  } else {

    fav.unshift(
      current
    );

    toast(
      'Added to liked songs'
    );
  }


  save();

  setLike();


  const library =
    $('#libraryView');


  if (
    library &&
    !library.classList.contains(
      'hidden'
    )
  ) {

    renderSongs(
      $('#libraryGrid'),
      fav
    );
  }
}


/* =========================================================
   MEDIA SESSION
========================================================= */

function setupMediaSession(song) {

  if (
    !song ||
    !('mediaSession' in navigator)
  ) {
    return;
  }


  try {

    navigator.mediaSession.metadata =
      new MediaMetadata({

        title:
          song.title,

        artist:
          song.channel,

        album:
          'OpenBeat',

        artwork: [
          {
            src:
              song.thumbnail ||
              DEFAULT_ART,

            sizes:
              '512x512',

            type:
              'image/jpeg'
          }
        ]

      });


    const handlers = {

      play: () => {

        if (yt) {
          yt.playVideo();
        }

      },

      pause: () => {

        if (yt) {
          yt.pauseVideo();
        }

      },

      nexttrack: () => {
        next();
      },

      previoustrack: () => {
        prev();
      }

    };


    Object.entries(
      handlers
    ).forEach(
      ([action, handler]) => {

        try {

          navigator.mediaSession
            .setActionHandler(
              action,
              handler
            );

        } catch {}
      }
    );

  } catch (error) {

    console.warn(
      'Media Session error:',
      error
    );
  }
}


/* =========================================================
   YOUTUBE PLAYER
========================================================= */

function destroyPlayerReference() {

  yt = null;

  setPlayingState(
    false
  );

  clearInterval(
    progressTimer
  );

  progressTimer = null;
}


function createPlayer(videoId) {

  if (!videoId) {
    return;
  }


  if (
    !window.YT ||
    !window.YT.Player
  ) {

    setTimeout(
      () => createPlayer(videoId),
      300
    );

    return;
  }


  /* Existing player */

  if (yt) {

    try {

      yt.loadVideoById(
        videoId
      );

      yt.playVideo();

      return;

    } catch (error) {

      console.warn(
        'Existing YouTube player failed:',
        error
      );

      destroyPlayerReference();
    }
  }


  const container =
    $('#youtubePlayer');


  if (!container) {

    console.error(
      'youtubePlayer element not found.'
    );

    return;
  }


  container.innerHTML = '';


  try {

    yt =
      new YT.Player(
        'youtubePlayer',
        {

          videoId,

          playerVars: {

            autoplay: 1,

            controls: 1,

            rel: 0,

            playsinline: 1,

            modestbranding: 1

          },


          events: {

            onReady: event => {

              const volume =
                Number(
                  $('#volume')?.value ||
                  80
                );


              try {

                event.target.setVolume(
                  volume
                );

              } catch {}


              try {

                event.target.playVideo();

              } catch {}


              setPlayingState(
                true
              );

              startProgressTimer();
            },


            onStateChange: event => {

              const state =
                event.data;


              if (
                state ===
                YT.PlayerState.PLAYING
              ) {

                setPlayingState(
                  true
                );

                startProgressTimer();

                if (
                  'mediaSession' in navigator
                ) {

                  try {

                    navigator.mediaSession
                      .playbackState =
                      'playing';

                  } catch {}
                }

                return;
              }


              if (
                state ===
                YT.PlayerState.PAUSED
              ) {

                setPlayingState(
                  false
                );

                if (
                  'mediaSession' in navigator
                ) {

                  try {

                    navigator.mediaSession
                      .playbackState =
                      'paused';

                  } catch {}
                }

                return;
              }


              if (
                state ===
                YT.PlayerState.BUFFERING
              ) {

                return;
              }


              if (
                state ===
                YT.PlayerState.ENDED
              ) {

                setPlayingState(
                  false
                );

                clearInterval(
                  progressTimer
                );


                if (repeat) {

                  if (current) {

                    try {

                      yt.seekTo(
                        0,
                        true
                      );

                      yt.playVideo();

                    } catch {

                      play(
                        current
                      );
                    }
                  }

                } else {

                  next();
                }

                return;
              }
            },


            onError: event => {

              console.warn(
                'YouTube error:',
                event.data
              );


              setPlayingState(
                false
              );


              toast(
                'This video cannot be played.'
              );


              setTimeout(
                () => {

                  next();

                },
                900
              );
            }

          }

        }
      );

  } catch (error) {

    console.error(
      'YouTube player creation error:',
      error
    );

    yt = null;

    toast(
      'Unable to start YouTube player.'
    );
  }
}


/* =========================================================
   PROGRESS
========================================================= */

function formatTime(seconds) {

  const value =
    Math.max(
      0,
      Math.floor(
        Number(seconds) || 0
      )
    );


  const minutes =
    Math.floor(
      value / 60
    );


  const secondsPart =
    String(
      value % 60
    ).padStart(
      2,
      '0'
    );


  return (
    minutes +
    ':' +
    secondsPart
  );
}


function updateProgress() {

  if (!yt) {
    return;
  }


  try {

    const duration =
      yt.getDuration();


    const currentTime =
      yt.getCurrentTime();


    if (
      !duration ||
      duration <= 0
    ) {
      return;
    }


    const range =
      $('#seekRange');


    if (range) {

      range.value =
        String(
          Math.round(
            (
              currentTime /
              duration
            ) *
            1000
          )
        );
    }


    const now =
      $('#timeNow');


    if (now) {

      now.textContent =
        formatTime(
          currentTime
        );
    }


    const end =
      $('#timeEnd');


    if (end) {

      end.textContent =
        formatTime(
          duration
        );
    }

  } catch {}
}


function startProgressTimer() {

  clearInterval(
    progressTimer
  );


  updateProgress();


  progressTimer =
    setInterval(
      updateProgress,
      500
    );
}


/* =========================================================
   PLAY
========================================================= */

function play(song) {

  const normalized =
    normalizeSong(song);


  if (!normalized) {

    toast(
      'Invalid song'
    );

    return;
  }


  current =
    normalized;


  const existingIndex =
    queue.findIndex(
      item =>
        item.id ===
        normalized.id
    );


  if (existingIndex >= 0) {

    idx =
      existingIndex;

  } else {

    queue.push(
      normalized
    );

    idx =
      queue.length - 1;
  }


  updatePlayerUI(
    normalized
  );


  recent = [
    normalized,
    ...recent.filter(
      item =>
        item.id !==
        normalized.id
    )
  ].slice(
    0,
    40
  );


  save();

  setLike();

  setupMediaSession(
    normalized
  );

  renderQueue();


  if (ytReady) {

    createPlayer(
      normalized.id
    );

  } else {

    toast(
      'Loading music player…'
    );

  }
}


/* =========================================================
   NEXT
========================================================= */

function next() {

  if (!queue.length) {

    toast(
      'Queue is empty'
    );

    return;
  }


  if (
    queue.length === 1
  ) {

    if (repeat && current) {

      play(
        current
      );

      return;
    }

    toast(
      'No more songs in queue'
    );

    return;
  }


  idx =
    (idx + 1) %
    queue.length;


  const song =
    queue[idx];


  if (song) {

    play(
      song
    );
  }
}


/* =========================================================
   PREVIOUS
========================================================= */

function prev() {

  if (!queue.length) {

    toast(
      'Queue is empty'
    );

    return;
  }


  if (
    queue.length === 1
  ) {

    if (yt) {

      try {

        yt.seekTo(
          0,
          true
        );

        yt.playVideo();

      } catch {}
    }

    return;
  }


  idx =
    (
      idx -
      1 +
      queue.length
    ) %
    queue.length;


  const song =
    queue[idx];


  if (song) {

    play(
      song
    );
  }
}


/* =========================================================
   PLAY / PAUSE
========================================================= */

function toggle() {

  if (!yt) {

    if (current) {

      createPlayer(
        current.id
      );

      return;
    }


    if (last.length) {

      play(
        last[0]
      );

      return;
    }


    loadQuery(
      'popular music',
      'Trending now',
      true
    );

    return;
  }


  try {

    const state =
      yt.getPlayerState();


    if (
      state ===
      YT.PlayerState.PLAYING
    ) {

      yt.pauseVideo();

    } else {

      yt.play
