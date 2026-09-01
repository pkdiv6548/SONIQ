'use strict';

/* =========================================================
   SONIQ — FINAL STABLE APP.JS
   - Existing /api/search endpoint preserved
   - Object API response protection
   - YouTube IFrame player preserved
   - Mobile menu fixed
   - View All actions fixed
   - Search / queue / likes / recent preserved
   - Player artwork + animation hooks preserved
   - Progress bar preserved
========================================================= */


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = selector => document.querySelector(selector);

const $$ = selector => [
  ...document.querySelectorAll(selector)
];


/* =========================================================
   CONFIG
========================================================= */

const DEFAULT_ART =
  './assets/images/openbeat-default.svg';

const API_ENDPOINT = '/api/search';

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

let searchTimer = null;
let progressTimer = null;

let repeat = false;
let deferredInstall = null;
let isCreatingPlayer = false;
let lastErrorVideo = null;


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
      ? parsed
      : [];

  } catch (error) {

    console.warn(
      'OpenBeat storage read error:',
      key,
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
      'OpenBeat storage write error:',
      key,
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
   SAFE VALUE EXTRACTION
   IMPORTANT:
   Prevents [object Object]
========================================================= */

function textValue(value, fallback = '') {

  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }


  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {

    const text =
      String(value).trim();

    return text || fallback;
  }


  if (Array.isArray(value)) {

    for (const item of value) {

      const result =
        textValue(item, '');

      if (result) {
        return result;
      }
    }

    return fallback;
  }


  if (typeof value === 'object') {

    const preferredKeys = [
      'text',
      'title',
      'name',
      'label',
      'value',
      'content',
      'simpleText',
      'runs'
    ];


    for (const key of preferredKeys) {

      if (
        Object.prototype.hasOwnProperty.call(
          value,
          key
        )
      ) {

        const result =
          textValue(
            value[key],
            ''
          );

        if (result) {
          return result;
        }
      }
    }


    if (
      Array.isArray(value.runs)
    ) {

      const joined =
        value.runs
          .map(run =>
            textValue(run, '')
          )
          .filter(Boolean)
          .join('');

      if (joined) {
        return joined;
      }
    }


    return fallback;
  }


  return fallback;
}


/* =========================================================
   NORMALIZE API SONG
========================================================= */

function normalizeSong(raw, index = 0) {

  if (
    !raw ||
    typeof raw !== 'object'
  ) {
    return null;
  }


  const id =
    textValue(
      raw.id ??
      raw.videoId ??
      raw.video_id ??
      raw.video?.id,
      ''
    );


  if (!id) {
    return null;
  }


  const title =
    textValue(
      raw.title ??
      raw.name ??
      raw.videoTitle ??
      raw.snippet?.title,
      'Unknown song'
    );


  const channel =
    textValue(
      raw.channel ??
      raw.artist ??
      raw.author ??
      raw.channelTitle ??
      raw.snippet?.channelTitle,
      'Unknown artist'
    );


  let thumbnail =
    textValue(
      raw.thumbnail ??
      raw.thumbnailUrl ??
      raw.image ??
      raw.imageUrl,
      ''
    );


  /* Handle YouTube-style thumbnail objects */

  if (
    !thumbnail &&
    raw.thumbnails &&
    typeof raw.thumbnails === 'object'
  ) {

    const thumb =
      raw.thumbnails.maxres ??
      raw.thumbnails.standard ??
      raw.thumbnails.high ??
      raw.thumbnails.medium ??
      raw.thumbnails.default;


    thumbnail =
      textValue(
        thumb?.url ??
        thumb,
        ''
      );
  }


  if (!thumbnail) {
    thumbnail = DEFAULT_ART;
  }


  return {
    id,
    title,
    channel,
    thumbnail,
    index
  };
}


/* =========================================================
   NORMALIZE API RESPONSE
========================================================= */

function normalizeResponse(data) {

  if (
    !data ||
    typeof data !== 'object'
  ) {

    return {
      items: [],
      cached: false
    };
  }


  let source =
    Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.results)
        ? data.results
        : Array.isArray(data.data)
          ? data.data
          : [];


  const items =
    source
      .map((song, index) =>
        normalizeSong(song, index)
      )
      .filter(Boolean);


  return {
    ...data,
    items
  };
}


/* =========================================================
   HTML ESCAPE
========================================================= */

function esc(value) {

  return String(
    textValue(value, '')
  ).replace(
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

  const element =
    $('#toast');

  if (!element) {
    return;
  }


  element.textContent =
    textValue(
      message,
      'Something went wrong'
    );


  element.classList.add('show');


  clearTimeout(toastTimer);


  toastTimer =
    setTimeout(() => {

      element.classList.remove(
        'show'
      );

    }, 2200);
}


/* =========================================================
   YOUTUBE API READY
========================================================= */

window.onYouTubeIframeAPIReady =
  function () {

    ytReady = true;


    if (current?.id) {

      createPlayer(
        current.id
      );
    }
  };


/* =========================================================
   API REQUEST
========================================================= */

async function api(query) {

  const q =
    String(query || '').trim();


  if (!q) {

    return {
      items: [],
      cached: false
    };
  }


  const url =
    `${API_ENDPOINT}?q=${encodeURIComponent(q)}`;


  let response;


  try {

    response =
      await fetch(
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

    throw new Error(
      'Unable to connect to the music API.'
    );
  }


  let data;


  try {

    data =
      await response.json();

  } catch (error) {

    throw new Error(
      'Invalid API response.'
    );
  }


  if (!response.ok) {

    const message =
      textValue(
        data?.error ??
        data?.message,
        'YouTube API request failed.'
      );


    throw new Error(
      message
    );
  }


  return normalizeResponse(data);
}


/* =========================================================
   SONG CARD
========================================================= */

function songCard(song, index) {

  const safeSong =
    normalizeSong(
      song,
      index
    );


  if (!safeSong) {
    return '';
  }


  return `
    <article
      class="song"
      data-i="${index}"
      data-video-id="${esc(safeSong.id)}"
    >

      <div class="cover">

        <img
          loading="lazy"
          src="${esc(safeSong.thumbnail)}"
          alt="${esc(safeSong.title)}"
          onerror="this.onerror=null;this.src='${DEFAULT_ART}'"
        >

        <button
          class="play"
          type="button"
          aria-label="Play ${esc(safeSong.title)}"
        >▶</button>

        <button
          class="add"
          type="button"
          aria-label="Add ${esc(safeSong.title)} to queue"
        >＋</button>

      </div>

      <b>${esc(safeSong.title)}</b>

      <span>${esc(safeSong.channel)}</span>

    </article>
  `;
}


/* =========================================================
   RENDER SONGS
========================================================= */

function renderSongs(
  element,
  items
) {

  if (!element) {
    return;
  }


  const songs =
    (Array.isArray(items)
      ? items
      : [])
      .map((song, index) =>
        normalizeSong(song, index)
      )
      .filter(Boolean);


  element.innerHTML =
    songs.length
      ? songs.map(songCard).join('')
      : '<p class="empty">Nothing here yet.</p>';


  element
    .querySelectorAll('.song')
    .forEach(
      (songElement, index) => {

        songElement.onclick =
          event => {

            const song =
              songs[index];


            if (!song) {
              return;
            }


            if (
              event.target.closest('.add')
            ) {

              if (
                !queue.some(
                  item =>
                    item.id === song.id
                )
              ) {

                queue.push(song);

                renderQueue();

                toast(
                  'Added to queue'
                );

              } else {

                toast(
                  'Already in queue'
                );
              }


              return;
            }


            if (!queue.length) {

              queue =
                [...songs];
            }


            const queueIndex =
              queue.findIndex(
                item =>
                  item.id === song.id
              );


            idx =
              queueIndex >= 0
                ? queueIndex
                : queue.push(song) - 1;


            play(song);
          };
      }
    );
}


/* =========================================================
   QUEUE
========================================================= */

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
      .slice(0, 10)
      .map(
        (song, index) => {

          const safe =
            normalizeSong(
              song,
              index
            );


          if (!safe) {
            return '';
          }


          return `
            <button
              class="queue-item"
              type="button"
              data-queue-index="${index}"
            >

              <img
                src="${esc(safe.thumbnail)}"
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
                  ${esc(safe.title)}
                </b>

                <span>
                  ${esc(safe.channel)}
                </span>

              </div>

            </button>
          `;
        }
      )
      .join('');


  list
    .querySelectorAll('.queue-item')
    .forEach(
      button => {

        button.onclick =
          () => {

            const position =
              Number(
                button.dataset.queueIndex
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
          };
      }
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
      .forEach(
        button => {

          button.onclick =
            () => {

              const playlist =
                PLAYLISTS[
                  Number(
                    button.dataset.i
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
            };
        }
      );
  }


  const genres =
    $('#sideGenres');


  if (genres) {

    genres.innerHTML =
      GENRES
        .map(
          genre => `
            <button
              class="genre"
              data-q="${esc(genre)}"
              type="button"
            >
              ♪ ${esc(genre)}
            </button>
          `
        )
        .join('');


    genres
      .querySelectorAll('.genre')
      .forEach(
        button => {

          button.onclick =
            () => {

              loadQuery(
                button.dataset.q,
                button.dataset.q,
                true
              );


              closeSide();
            };
        }
      );
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


  (Array.isArray(items)
    ? items
    : []
  ).forEach(
    (song, index) => {

      const safe =
        normalizeSong(
          song,
          index
        );


      if (!safe) {
        return;
      }


      if (
        !artists.some(
          item =>
            item.channel ===
            safe.channel
        )
      ) {

        artists.push(
          safe
        );
      }
    }
  );


  element.innerHTML =
    artists
      .slice(0, 8)
      .map(
        artist => `
          <div
            class="artist"
            data-artist="${esc(artist.channel)}"
          >

            <img
              loading="lazy"
              src="${esc(artist.thumbnail)}"
              alt="${esc(artist.channel)}"
              onerror="this.onerror=null;this.src='${DEFAULT_ART}'"
            >

            <b>
              ${esc(artist.channel)}
            </b>

          </div>
        `
      )
      .join('');
}


/* =========================================================
   ARTWORK
========================================================= */

function setArtwork(song) {

  const thumbnail =
    textValue(
      song?.thumbnail,
      DEFAULT_ART
    ) || DEFAULT_ART;


  [
    'bigThumb',
    'miniThumb',
    'heroThumb'
  ].forEach(
    id => {

      const element =
        $('#' + id);


      if (!element) {
        return;
      }


      element.src =
        thumbnail;


      element.onerror =
        function () {

          this.onerror =
            null;

          this.src =
            DEFAULT_ART;
        };
    }
  );
}


/* =========================================================
   PLAYER UI
========================================================= */

function updatePlayerUI(song) {

  if (!song) {
    return;
  }


  const safe =
    normalizeSong(song);


  if (!safe) {
    return;
  }


  [
    'nowTitle',
    'miniTitle',
    'heroNowTitle'
  ].forEach(
    id => {

      const element =
        $('#' + id);


      if (element) {

        element.textContent =
          safe.title;
      }
    }
  );


  [
    'nowArtist',
    'miniArtist',
    'heroNowArtist'
  ].forEach(
    id => {

      const element =
        $('#' + id);


      if (element) {

        element.textContent =
          safe.channel;
      }
    }
  );


  setArtwork(
    safe
  );
}


/* =========================================================
   PLAYING ANIMATION STATE
========================================================= */

function setPlayingState(
  playing
) {

  [
    'heroArt',
    'nowCover'
  ].forEach(
    id => {

      const element =
        $('#' + id);


      if (element) {

        element.classList.toggle(
          'is-playing',
          Boolean(playing)
        );
      }
    }
  );


  const miniArt =
    document.querySelector(
      '.mini-art'
    );


  if (miniArt) {

    miniArt.classList.toggle(
      'is-playing',
      Boolean(playing)
    );
  }


  [
    'playBtn',
    'bottomPlay'
  ].forEach(
    id => {

      const button =
        $('#' + id);


      if (button) {

        button.textContent =
          playing
            ? 'Ⅱ'
            : '▶';

        button.setAttribute(
          'aria-label',
          playing
            ? 'Pause'
            : 'Play'
        );
      }
    }
  );
}


/* =========================================================
   TIME FORMAT
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


  const remaining =
    value % 60;


  return (
    minutes +
    ':' +
    String(
      remaining
    ).padStart(
      2,
      '0'
    )
  );
}


/* =========================================================
   PROGRESS
========================================================= */

function stopProgress() {

  clearInterval(
    progressTimer
  );

  progressTimer =
    null;
}


function startProgress() {

  stopProgress();


  progressTimer =
    setInterval(
      () => {

        if (!yt) {
          return;
        }


        try {

          const duration =
            yt.getDuration();


          const currentTime =
            yt.getCurrentTime();


          if (
            !Number.isFinite(duration) ||
            duration <= 0
          ) {
            return;
          }


          const range =
            $('#seekRange');


          const timeNow =
            $('#timeNow');


          const timeEnd =
            $('#timeEnd');


          if (range) {

            range.value =
              String(
                Math.round(
                  (
                    currentTime /
                    duration
                  ) * 1000
                )
              );
          }


          if (timeNow) {

            timeNow.textContent =
              formatTime(
                currentTime
              );
          }


          if (timeEnd) {

            timeEnd.textContent =
              formatTime(
                duration
              );
          }

        } catch {}
      },
      500
    );
}


/* =========================================================
   MEDIA SESSION
========================================================= */

function setupMediaSession(
  song
) {

  if (
    !('mediaSession' in navigator)
  ) {
    return;
  }


  const safe =
    normalizeSong(song);


  if (!safe) {
    return;
  }


  try {

    navigator.mediaSession.metadata =
      new MediaMetadata({
        title: safe.title,
        artist: safe.channel,
        album: 'SONIQ',
        artwork: [
          {
            src: safe.thumbnail,
            sizes: '512x512',
            type: 'image/jpeg'
          }
        ]
      });


    const actions = [
      [
        'play',
        () => {
          yt?.playVideo();
        }
      ],
      [
        'pause',
        () => {
          yt?.pauseVideo();
        }
      ],
      [
        'nexttrack',
        next
      ],
      [
        'previoustrack',
        prev
      ]
    ];


    actions.forEach(
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
      'Media Session:',
      error
    );
  }
}


/* =========================================================
   YOUTUBE PLAYER
========================================================= */

function createPlayer(
  videoId
) {

  if (!videoId) {
    return;
  }


  if (
    !window.YT ||
    !window.YT.Player
  ) {

    setTimeout(
      () => createPlayer(videoId),
      400
    );

    return;
  }


  /* Reuse existing player */

  if (yt) {

    try {

      yt.loadVideoById(
        videoId
      );

      return;

    } catch (error) {

      console.warn(
        'Existing YouTube player failed:',
        error
      );


      try {
        yt.destroy();
      } catch {}


      yt = null;
    }
  }


  if (isCreatingPlayer) {
    return;
  }


  const container =
    $('#youtubePlayer');


  if (!container) {
    return;
  }


  isCreatingPlayer =
    true;


  container.innerHTML =
    '';


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
            modestbranding: 1,
            iv_load_policy: 3
          },


          events: {

            onReady:
              event => {

                isCreatingPlayer =
                  false;


                const volume =
                  Number(
                    $('#volume')?.value ||
                    80
                  );


                try {

                  event.target
                    .setVolume(
                      volume
                    );

                } catch {}


                try {

                  event.target
                    .playVideo();

                } catch {}


                setPlayingState(
                  true
                );


                startProgress();
              },


            onStateChange:
              event => {

                const state =
                  event.data;


                if (
                  state ===
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

                      navigator
                        .mediaSession
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


                  stopProgress();


                  if (
                    'mediaSession'
                    in navigator
                  ) {

                    try {

                      navigator
                        .mediaSession
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

                  /* Keep visual player state active */
                  return;
                }


                if (
                  state ===
                  YT.PlayerState.ENDED
                ) {

                  setPlayingState(
                    false
                  );


                  stopProgress();


                  if (repeat) {

                    if (current?.id) {

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


            onError:
              event => {

                console.warn(
                  'YouTube player error:',
                  event.data
                );


                setPlayingState(
                  false
                );


                /*
                  Avoid repeatedly retrying
                  the same broken video.
                */

                if (
                  lastErrorVideo ===
                  videoId
                ) {

                  return;
                }


                lastErrorVideo =
                  videoId;


                toast(
                  'This video cannot be played. Trying next...'
                );


                setTimeout(
                  () => {

                    lastErrorVideo =
                      null;

                    next();

                  },
                  900
                );
              }
          }
        }
      );

  } catch (error) {

    isCreatingPlayer =
      false;

    yt = null;


    console.error(
      'YouTube player creation error:',
      error
    );


    toast(
      'Unable to start YouTube player.'
    );
  }
}


/* =========================================================
   PLAY
========================================================= */

function play(song) {

  const safe =
    normalizeSong(song);


  if (!safe) {
    return;
  }


  current =
    safe;


  const existingIndex =
    queue.findIndex(
      item =>
        item.id === safe.id
    );


  if (
    existingIndex >= 0
  ) {

    idx =
      existingIndex;

  } else {

    queue.push(
      safe
    );

    idx =
      queue.length - 1;
  }


  updatePlayerUI(
    safe
  );


  recent = [
    safe,
    ...recent.filter(
      item =>
        item.id !== safe.id
    )
  ].slice(
    0,
    40
  );


  save();


  setLike();


  setupMediaSession(
    safe
  );


  renderQueue();


  lastErrorVideo =
    null;


  if (ytReady) {

    createPlayer(
      safe.id
    );

  } else {

    setTimeout(
      () => {

        if (current?.id === safe.id) {

          createPlayer(
            safe.id
          );
        }

      },
      500
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


  idx =
    (idx + 1) %
    queue.length;


  play(
    queue[idx]
  );
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


  idx =
    (idx - 1 + queue.length) %
    queue.length;


  play(
    queue[idx]
  );
}


/* =========================================================
   TOGGLE PLAY / PAUSE
========================================================= */

function toggle() {

  if (!yt) {

    if (current) {

      createPlayer(
        current.id
      );

      return;
    }


    if (last[0]) {

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

  } catch (error) {

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
        song =>
          song.id === current.id
      )
    );


  [
    'likeBtn',
    'miniLike'
  ].forEach(
    id => {

      const element =
        $('#' + id);


      if (element) {

        element.textContent =
          liked
            ? '♥'
            : '♡';
      }
    }
  );
}


function like() {

  if (!current) {

    toast(
      'Choose a song first'
    );

    return;
  }


  const position =
    fav.findIndex(
      song =>
        song.id === current.id
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


  if (
    !$('#libraryView')
      ?.classList.contains('hidden')
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

function view(
  viewName
) {

  const views = [
    'home',
    'search',
    'library',
    'recent'
  ];


  views.forEach(
    name => {

      const element =
        $('#' + name + 'View');


      if (!element) {
        return;
      }


      element.classList.toggle(
        'hidden',
        name !== viewName
      );
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
            data-h="${esc(query)}"
          >
            ⌕ ${esc(query)}
          </button>
        `
      )
      .join('');


  element
    .querySelectorAll('button')
    .forEach(
      button => {

        button.onclick =
          () => {

            doSearch(
              button.dataset.h
            );
          };
      }
    );
}


/* =========================================================
   LOAD QUERY
========================================================= */

async function loadQuery(
  query,
  title,
  home = false
) {

  const cleanQuery =
    String(
      query || ''
    ).trim();


  if (!cleanQuery) {
    return;
  }


  if (home) {

    const titleElement =
      $('#trendingTitle');


    if (titleElement) {

      titleElement.textContent =
        textValue(
          title,
          'Trending now'
        );
    }


    view(
      'home'
    );
  }


  const target =
    home
      ? $('#trendingGrid')
      : $('#searchGrid');


  if (target) {

    target.innerHTML =
      '<p class="empty">Loading music...</p>';
  }


  try {

    const data =
      await api(
        cleanQuery
      );


    last =
      data.items;


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


    idx =
      -1;


    renderQueue();

  } catch (error) {

    console.error(
      'Load query error:',
      error
    );


    if (target) {

      target.innerHTML = `
        <p class="empty">
          ${esc(
            error?.message ||
            'Unable to load music.'
          )}
        </p>
      `;
    }


    toast(
      error?.message ||
      'Unable to load music.'
    );
  }
}


/* =========================================================
   SEARCH
========================================================= */

async function doSearch(
  query
) {

  const cleanQuery =
    String(
      query || ''
    ).trim();


  if (
    cleanQuery.length <
    3
  ) {

    toast(
      'Type at least 3 characters'
    );

    return;
  }


  history = [
    cleanQuery,
    ...history.filter(
      item =>
        String(item).toLowerCase() !==
        cleanQuery.toLowerCase()
    )
  ].slice(
    0,
    12
  );


  save();


  view(
    'search'
  );


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
      '<p class="empty">Searching for music...</p>';
  }


  try {

    const data =
      await api(
        cleanQuery
      );


    last =
      data.items;


    renderSongs(
      grid,
      last
    );


    if (status) {

      status.textContent =
        `${last.length} results` +
        (
          data.cached
            ? ' • cached'
            : ''
        );
    }


    renderHistory();

  } catch (error) {

    console.error(
      'Search error:',
      error
    );


    if (grid) {

      grid.innerHTML = `
        <p class="empty">
          ${esc(
            error?.message ||
            'Search unavailable.'
          )}
        </p>
      `;
    }


    if (status) {

      status.textContent =
        'Unavailable';
    }


    toast(
      error?.message ||
      'Search unavailable.'
    );
  }
}


/* =========================================================
   CLOSE MOBILE MENU
========================================================= */

function closeSide() {

  document.body.classList.remove(
    'side-open'
  );
}


/* =========================================================
   SEARCH FORM
========================================================= */

$('#searchForm')
  ?.addEventListener(
    'submit',
    event => {

      event.preventDefault();


      doSearch(
        $('#searchInput')
          ?.value || ''
      );
    }
  );


$('#searchInput')
  ?.addEventListener(
    'input',
    () => {

      clearTimeout(
        searchTimer
      );


      const query =
        $('#searchInput')
          ?.value
          ?.trim() || '';


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


/* =========================================================
   NAV
========================================================= */

$$('.nav')
  .forEach(
    button => {

      button.addEventListener(
        'click',
        event => {

          event.preventDefault();


          const target =
            button.dataset.view;


          if (target) {

            view(
              target
            );
          }
        }
      );
    }
  );


/* =========================================================
   CLEAR HISTORY
========================================================= */

$('#clearHistory')
  ?.addEventListener(
    'click',
    () => {

      history = [];


      save();


      renderHistory();


      toast(
        'Search history cleared'
      );
    }
  );


/* =========================================================
   NEW PLAYLIST
========================================================= */

$('#newPlaylist')
  ?.addEventListener(
    'click',
    () => {

      toast(
        'Custom playlist feature is coming soon.'
      );
    }
  );


/* =========================================================
   HERO PLAY
========================================================= */

$('#heroPlay')
  ?.addEventListener(
    'click',
    () => {

      if (last[0]) {

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
   REFRESH / SEE BUTTONS
========================================================= */

$$('.see')
  .forEach(
    button => {

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
    }
  );


/* =========================================================
   VIEW ALL — PLAYLISTS
   Works even if HTML button has no ID.
========================================================= */

function bindViewAllButtons() {

  const sections =
    $$('.section-head');


  sections.forEach(
    section => {

      const heading =
        section.querySelector(
          'h2'
        );


      const button =
        section.querySelector(
          'button'
        );


      if (
        !heading ||
        !button
      ) {
        return;
      }


      const text =
        heading.textContent
          .trim()
          .toLowerCase();


      if (
        text.includes(
          'popular playlists'
        )
      ) {

        button.onclick =
          () => {

            loadQuery(
              'popular music playlists',
              'Popular playlists',
              true
            );
          };

      }


      if (
        text.includes(
          'top artists'
        )
      ) {

        button.onclick =
          () => {

            $('#artistGrid')
              ?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              });
          };
      }
    }
  );
}


/* =========================================================
   PLAYER CONTROLS
========================================================= */

[
  'playBtn',
  'bottomPlay'
]
.forEach(
  id => {

    $('#' + id)
      ?.addEventListener(
        'click',
        toggle
      );
  }
);


[
  'prevBtn',
  'bottomPrev'
]
.forEach(
  id => {

    $('#' + id)
      ?.addEventListener(
        'click',
        prev
      );
  }
);


[
  'nextBtn',
  'bottomNext'
]
.forEach(
  id => {

    $('#' + id)
      ?.addEventListener(
        'click',
        next
      );
  }
);


/* =========================================================
   SHUFFLE
========================================================= */

[
  'shuffleBtn',
  'bottomShuffle'
]
.forEach(
  id => {

    $('#' + id)
      ?.addEventListener(
        'click',
        () => {

          if (
            queue.length <
            2
          ) {

            toast(
              'Add more songs to shuffle'
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
            'Queue shuffled'
          );
        }
      );
  }
);


/* =========================================================
   REPEAT
========================================================= */

[
  'repeatBtn',
  'bottomRepeat'
]
.forEach(
  id => {

    $('#' + id)
      ?.addEventListener(
        'click',
        () => {

          repeat =
            !repeat;


          toast(
            repeat
              ? 'Repeat one enabled'
              : 'Repeat disabled'
          );
        }
      );
  }
);


/* =========================================================
   LIKE BUTTONS
========================================================= */

$('#likeBtn')
  ?.addEventListener(
    'click',
    like
  );


$('#miniLike')
  ?.addEventListener(
    'click',
    like
  );


/* =========================================================
   CLEAR QUEUE
========================================================= */

$('#clearQueue')
  ?.addEventListener(
    'click',
    () => {

      queue = [];

      idx = -1;

      renderQueue();

      toast(
        'Queue cleared'
      );
    }
  );


/* =========================================================
   RIGHT PLAYER PANEL
========================================================= */

$('#panelBtn')
  ?.addEventListener(
    'click',
    () => {

      document.body.classList.toggle(
        'right-open'
      );
    }
  );


$('#closePanel')
  ?.addEventListener(
    'click',
    () => {

      document.body.classList.remove(
        'right-open'
      );
    }
  );


/* =========================================================
   VIDEO MODAL
========================================================= */

$('#videoBtn')
  ?.addEventListener(
    'click',
    () => {

      if (!current) {

        toast(
          'Choose a song first'
        );

        return;
      }


      $('#videoModal')
        ?.classList.remove(
          'hidden'
        );
    }
  );


$('#closeVideo')
  ?.addEventListener(
    'click',
    () => {

      $('#videoModal')
        ?.classList.add(
          'hidden'
        );
    }
  );


/* =========================================================
   VOLUME
========================================================= */

$('#volume')
  ?.addEventListener(
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


/* =========================================================
   MUTE
========================================================= */

$('#muteBtn')
  ?.addEventListener(
    'click',
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

      } catch {}
    }
  );


/* =========================================================
   MOBILE MENU
========================================================= */

$('#menuBtn')
  ?.addEventListener(
    'click',
    event => {

      event.preventDefault();

      event.stopPropagation();


      document.body.classList.toggle(
        'side-open'
      );
    }
  );


/* =========================================================
   OPTIONAL MOBILE CLOSE BUTTON
========================================================= */

$('#closeMenu')
  ?.addEventListener(
    'click',
    event => {

      event.preventDefault();

      event.stopPropagation();

      closeSide();
    }
  );


/* =========================================================
   CLOSE MENU WHEN CLICKING OUTSIDE
========================================================= */

document.addEventListener(
  'click',
  event => {

    if (
      !document.body.classList.contains(
        'side-open'
      )
    ) {
      return;
    }


    const sidebar =
      $('#sidebar');


    const menu =
      $('#menuBtn');


    if (
      sidebar &&
      !sidebar.contains(
        event.target
      ) &&
      !menu?.contains(
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

$('#mobileSearch')
  ?.addEventListener(
    'click',
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
   THEME
========================================================= */

$('#themeBtn')
  ?.addEventListener(
    'click',
    () => {

      toast(
        'Premium dark theme active'
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


$('#installBtn')
  ?.addEventListener(
    'click',
    async () => {

      if (!deferredInstall) {

        toast(
          'Use browser menu → Install app'
        );

        return;
      }


      try {

        deferredInstall.prompt();

        await deferredInstall
          .userChoice;

      } catch {}


      deferredInstall =
        null;
    }
  );


/* =========================================================
   SEEK
========================================================= */

$('#seekRange')
  ?.addEventListener(
    'input',
    event => {

      if (!yt) {
        return;
      }


      try {

        const duration =
          yt.getDuration();


        if (
          duration > 0
        ) {

          const position =
            Number(
              event.target.value
            ) / 1000;


          yt.seekTo(
            duration *
            position,
            true
          );
        }

      } catch {}
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


      document.body
        .classList.remove(
          'right-open'
        );
    }


    /*
      Spacebar:
      Do not hijack when user is
      typing inside input/textarea.
    */

    if (
      event.code ===
      'Space' &&
      !['INPUT', 'TEXTAREA', 'BUTTON']
        .includes(
          document.activeElement?.tagName
        )
    ) {

      event.preventDefault();

      toggle();
    }
  }
);


/* =========================================================
   SERVICE WORKER
========================================================= */

if (
  'serviceWorker'
  in navigator
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

function initApp() {

  renderPlaylists();

  renderQueue();

  bindViewAllButtons();


  /*
    Do not wait for the user.
    Load the existing default feed.
  */

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
    initApp,
    {
      once: true
    }
  );

} else {

  initApp();
}
