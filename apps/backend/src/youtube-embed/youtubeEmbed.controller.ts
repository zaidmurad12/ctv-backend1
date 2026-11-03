import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators/decorators.js';

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

// A real, hosted page - not the WebView-local `loadDataWithBaseURL`/fake-baseUrl document the RN
// app used to build inline for both its full-movie YouTube playback (VideoPlayer.tsx) and its
// trailer preview (MovieDetailsScreen.tsx) - is what those two now point their WebView at instead
// of constructing their own HTML string. That local-HTML-plus-fake-origin trick turned out to be
// the actual root cause of a long-standing, previously unnoticed bug: it silently failed *every*
// YouTube embed in the app - trailers included, on every device, not just one - because the
// origin it faked never actually satisfied the real IFrame Player API's own validation (surfacing
// as an unexplained numeric error, e.g. 152, during troubleshooting; trailers just failed quietly
// and fell back to a plain backdrop image instead of erroring visibly). Serving this from a real
// https:// URL under this backend's own domain gives YouTube's player a genuine, consistent
// origin - exactly the officially documented way third-party sites embed the IFrame Player API,
// with none of the spoofing the old approach relied on.
@Controller('youtube-embed')
export class YoutubeEmbedController {
  @Public()
  @Get()
  serve(
    @Query('v') v: string | undefined,
    @Query('autoplay') autoplayParam: string | undefined,
    @Query('mute') muteParam: string | undefined,
    @Query('controls') controlsParam: string | undefined,
    @Query('loop') loopParam: string | undefined,
    @Query('unmuteOnPlay') unmuteOnPlayParam: string | undefined,
    @Query('bg') bgParam: string | undefined,
    @Query('preview') previewParam: string | undefined,
    @Res() res: Response,
  ): void {
    // Validated rather than trusted as-is before ever reaching the template below - this is the
    // one piece of this page actually driven by caller-supplied input (the boolean flags are only
    // ever "0"/"1", nothing to inject either way).
    const videoId = v && VIDEO_ID_RE.test(v) ? v : '';
    const autoplay = autoplayParam !== '0';
    const mute = muteParam !== '0';
    const controls = controlsParam === '1';
    const loop = loopParam === '1';
    const unmuteOnPlay = unmuteOnPlayParam === '1';
    // Defaults to solid black (right for a full-screen player with nothing behind it) - the
    // trailer preview passes 'transparent' instead so the movie's own backdrop image (already
    // loaded, sitting behind this WebView the whole time) shows through during the load/buffer
    // gap before the video itself paints, rather than a plain black rectangle. Reported as "a
    // black screen shows before the trailer plays, try to shorten it" - the actual load time
    // doesn't change, but a rich image showing through in the meantime reads as a much shorter
    // wait than a flat color does.
    const bg = bgParam === 'transparent' ? 'transparent' : '#000';
    // preview=1: the TV app's background trailer on a title's details screen. Lighter and cleaner
    // than the full player: the iframe is laid out at 640x360 (so YouTube streams a small rendition
    // instead of HD - it sizes quality to the player, and this is only a background preview) and
    // scaled up to cover the box with 30% extra zoom and shifted up by 5% of the box height (some
    // trailers' title bar still peeked in at 25% centered zoom), which pushes YouTube's own title/channel bar
    // and logo outside the visible crop; and no 250ms time polling (4 bridge messages a second into
    // the app's JS thread that the details screen never used).
    const preview = previewParam === '1';

    const playerVars = [
      `autoplay:${autoplay ? 1 : 0}`,
      `mute:${mute ? 1 : 0}`,
      `controls:${controls ? 1 : 0}`,
      'modestbranding:1',
      'rel:0',
      'iv_load_policy:3',
      'fs:0',
      'disablekb:1',
      'playsinline:1',
      // Explicit 0, not just omitted - the app's own custom subtitle overlay (drawn separately by
      // the RN client from its own subtitle file) is the only caption track meant to ever show
      // here. Leaving this unset would still default to off for most videos, but not reliably:
      // some videos carry their own "show captions by default" setting, and a WebView's persisted
      // per-origin storage can carry over a captions-on preference across sessions - this pins it
      // off regardless of either.
      'cc_load_policy:0',
    ];
    // The preview loops on its own instead (see below): a one-video playlist - how YouTube loops -
    // made the player draw its previous/next arrows over the trailer, plus an end screen each time.
    if (loop && videoId && !preview) {
      playerVars.push('loop:1', `playlist:'${videoId}'`);
    }

    const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
      html,body,#wrap{margin:0;padding:0;width:100%;height:100%;background:${bg};overflow:hidden;}
      #wrap{position:relative;}
      /* YT.Player replaces the #player div below with its own <iframe>, sized to the video's
         real 16:9 aspect ratio by default - whenever the WebView's own container isn't exactly
         16:9 itself (routine on a TV screen, since this container's actual height/width ratio is
         driven by this app's own layout, not the video's), the player letterboxes/pillarboxes to
         preserve that ratio, leaving plain black bars down the sides - reported as "black edges
         on the sides, doesn't look like part of the app." Targeting the iframe by tag (not by the
         #player id, which doesn't carry over to the element YT.Player actually inserts) and
         oversizing it - whichever of a vw-based or vh-based 16:9 box is larger always covers the
         full #wrap - then centering and clipping the overflow is the standard "fill and crop
         instead of letterbox" technique: the video itself always fills edge-to-edge now, with
         its own excess (whatever would have been a bar) simply falling outside the visible crop
         instead of showing as one.
      */
      #wrap iframe{position:absolute;top:50%;left:50%;width:100vw;height:56.25vw;min-width:177.78vh;min-height:100vh;transform:translate(-50%,-50%);border:0;}
      ${preview ? '#wrap iframe{width:640px;height:360px;min-width:0;min-height:0;transform:translate(-50%,-50%) translateY(-5vh) scale(var(--s,1));}' : ''}
    </style></head><body><div id="wrap"><div id="player"></div></div><script>
      window.onerror=function(msg){ window.ReactNativeWebView.postMessage('diag:jserror:'+msg); };
      var tag=document.createElement('script');
      tag.src="https://www.youtube.com/iframe_api";
      tag.onerror=function(){ window.ReactNativeWebView.postMessage('diag:apiscriptfail'); };
      document.body.appendChild(tag);
      ${preview ? "function fit(){var s=Math.max(window.innerWidth/640,window.innerHeight/360)*1.3;document.documentElement.style.setProperty('--s',s);}fit();window.addEventListener('resize',fit);" : ''}
      function onYouTubeIframeAPIReady(){
        window.ReactNativeWebView.postMessage('diag:apiready');
        player = new YT.Player('player',{
          videoId:'${videoId}',
          playerVars:{${playerVars.join(',')}},
          events:{
            onReady:function(e){
              window.ReactNativeWebView.postMessage('diag:ready');
              // Belt-and-suspenders alongside cc_load_policy:0 above - explicitly unloading the
              // captions module covers a video that somehow still turned them on by the time this
              // fires (a stored per-origin preference winning a race against the playerVar, or a
              // per-video default cc_load_policy doesn't override).
              e.target.unloadModule('captions');
              e.target.playVideo();
              ${preview && loop ? 'setInterval(function(){var d=player.getDuration(),t=player.getCurrentTime();if(d>0&&t>d-0.8){player.seekTo(0,true);window.ReactNativeWebView.postMessage("loop");}},400);' : ''}
              ${preview ? 'if(false)' : ''}setInterval(function(){
                window.ReactNativeWebView.postMessage(JSON.stringify({type:'time',currentTime:player.getCurrentTime(),duration:player.getDuration()}));
              },250);
            },
            onStateChange:function(e){
              window.ReactNativeWebView.postMessage('diag:state:'+e.data);
              // Repeated on every state change, not just once in onReady - a single call there
              // wasn't enough to keep captions off for every video (reported as "YouTube's default
              // captions still show"), most likely because some videos' own caption module
              // re-initializes itself once real playback actually begins (a later state than
              // onReady), overriding that first call. Calling this again on every subsequent
              // state - cued, buffering, playing, and any later one - keeps re-asserting it
              // regardless of when exactly that reinitialization happens to land.
              try { e.target.unloadModule('captions'); } catch (err) {}
              if(e.data===YT.PlayerState.PLAYING){
                ${unmuteOnPlay ? 'player.unMute();' : ''}
                window.ReactNativeWebView.postMessage('playing');
              }
            },
            onError:function(e){ window.ReactNativeWebView.postMessage('error:'+e.data); }
          }
        });
      }
    </script></body></html>`;

    // helmet's app-wide default CSP (see main.ts's own helmet() call - it only customizes
    // crossOriginResourcePolicy, every other default stays on) sets `script-src 'self'` on every
    // response including this one, which would block both this page's own inline <script> and the
    // youtube.com iframe_api it loads - overriding it here, on this one response, is what actually
    // lets either run at all. Nothing else this route returns is sensitive enough to need the
    // header's other protections.
    res.removeHeader('Content-Security-Policy');
    // The page is fully determined by its query string - let the WebView reuse it instead of
    // re-downloading it (from a possibly cold Cloud Run instance) for every trailer.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type('html').send(html);
  }
}
