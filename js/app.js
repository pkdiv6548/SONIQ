'use strict';

/* =========================================================
   OPENBEAT NEXT v5.1
   Frontend Music Player
   Existing Vercel API:
   /api/search?q=SEARCH_QUERY
========================================================= */

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];


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

const DEFAULT_ART =
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
