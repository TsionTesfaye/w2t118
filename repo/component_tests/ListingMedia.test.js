/**
 * ListingMedia — Component Unit Tests
 *
 * Pure presentational component. No stores, no services, no async.
 * isVideoMedia() decides <video> vs <img> based on item.type and item.url/data.
 *
 * Coverage:
 *   - Empty media → no .media-grid
 *   - Non-empty media → .media-grid rendered
 *   - Plain image object → <img>
 *   - item.type starting with 'video/' → <video>
 *   - item.url ending in .mp4 → <video>
 *   - item.data ending in .webm → <video>
 *   - item.url ending in .jpg → <img>
 *   - N media items → N total media elements
 *   - img src comes from item.url
 *   - img falls back to item.data when url absent
 *   - video src comes from item.url
 */

import { mount } from '@vue/test-utils';
import ListingMedia from '../src/views/marketplace/components/ListingMedia.vue';

function mountMedia(media) {
  return mount(ListingMedia, { props: { media } });
}

// ── Empty media ────────────────────────────────────────────────────────────────

describe('ListingMedia — empty / missing media', () => {
  it('renders no .media-grid when media is an empty array', () => {
    const wrapper = mountMedia([]);
    expect(wrapper.find('.media-grid').exists()).toBe(false);
  });

  it('renders no .media-grid when media prop is omitted (default [])', () => {
    const wrapper = mount(ListingMedia);
    expect(wrapper.find('.media-grid').exists()).toBe(false);
  });

  it('renders no img or video tags when media is empty', () => {
    const wrapper = mountMedia([]);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('video').exists()).toBe(false);
  });
});

// ── Non-empty media ────────────────────────────────────────────────────────────

describe('ListingMedia — media-grid presence', () => {
  it('renders .media-grid when media has at least one item', () => {
    const wrapper = mountMedia([{ url: 'https://example.com/photo.jpg' }]);
    expect(wrapper.find('.media-grid').exists()).toBe(true);
  });

  it('renders .media-grid when media contains a video item', () => {
    const wrapper = mountMedia([{ url: 'https://cdn.example.com/clip.mp4' }]);
    expect(wrapper.find('.media-grid').exists()).toBe(true);
  });
});

// ── Image rendering ────────────────────────────────────────────────────────────

describe('ListingMedia — img rendering', () => {
  it('renders <img> for a plain image object with only a url (no type)', () => {
    const wrapper = mountMedia([{ url: 'https://example.com/photo.jpg' }]);
    expect(wrapper.find('img').exists()).toBe(true);
    expect(wrapper.find('video').exists()).toBe(false);
  });

  it('renders <img> when item url ends in .jpg', () => {
    const wrapper = mountMedia([{ url: 'https://example.com/image.jpg' }]);
    expect(wrapper.find('img').exists()).toBe(true);
  });

  it('renders <img> when item url ends in .png', () => {
    const wrapper = mountMedia([{ url: 'https://example.com/image.png' }]);
    expect(wrapper.find('img').exists()).toBe(true);
  });

  it('renders <img> when item url ends in .gif', () => {
    const wrapper = mountMedia([{ url: 'https://example.com/anim.gif' }]);
    expect(wrapper.find('img').exists()).toBe(true);
  });

  it('sets img src from item.url', () => {
    const url = 'https://example.com/photo.jpg';
    const wrapper = mountMedia([{ url }]);
    expect(wrapper.find('img').attributes('src')).toBe(url);
  });

  it('falls back img src to item.data when url is absent', () => {
    const data = 'data:image/png;base64,abc123==';
    const wrapper = mountMedia([{ data }]);
    expect(wrapper.find('img').exists()).toBe(true);
    expect(wrapper.find('img').attributes('src')).toBe(data);
  });

  it('prefers item.url over item.data for img src', () => {
    const url = 'https://example.com/real.jpg';
    const data = 'data:image/jpeg;base64,fallback==';
    const wrapper = mountMedia([{ url, data }]);
    expect(wrapper.find('img').attributes('src')).toBe(url);
  });
});

// ── Video rendering ────────────────────────────────────────────────────────────

describe('ListingMedia — video rendering', () => {
  it('renders <video> when item.type starts with "video/"', () => {
    const wrapper = mountMedia([{ type: 'video/mp4', url: 'https://cdn.example.com/clip.mp4' }]);
    expect(wrapper.find('video').exists()).toBe(true);
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('renders <video> when item.type is "video/webm"', () => {
    const wrapper = mountMedia([{ type: 'video/webm', url: 'https://cdn.example.com/clip.webm' }]);
    expect(wrapper.find('video').exists()).toBe(true);
  });

  it('renders <video> when item.type is "video/ogg"', () => {
    const wrapper = mountMedia([{ type: 'video/ogg', url: 'https://cdn.example.com/clip.ogg' }]);
    expect(wrapper.find('video').exists()).toBe(true);
  });

  it('renders <video> when item url ends in .mp4 (no type field)', () => {
    const wrapper = mountMedia([{ url: 'https://cdn.example.com/video.mp4' }]);
    expect(wrapper.find('video').exists()).toBe(true);
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('renders <video> when item url ends in .webm (no type field)', () => {
    const wrapper = mountMedia([{ url: 'https://cdn.example.com/video.webm' }]);
    expect(wrapper.find('video').exists()).toBe(true);
  });

  it('renders <video> when item url ends in .ogg (no type field)', () => {
    const wrapper = mountMedia([{ url: 'https://cdn.example.com/audio.ogg' }]);
    expect(wrapper.find('video').exists()).toBe(true);
  });

  it('renders <video> when item url ends in .mov (no type field)', () => {
    const wrapper = mountMedia([{ url: 'https://cdn.example.com/video.mov' }]);
    expect(wrapper.find('video').exists()).toBe(true);
  });

  it('renders <video> when item.data ends in .webm (no url)', () => {
    const wrapper = mountMedia([{ data: 'data:video/webm;base64,clip.webm' }]);
    expect(wrapper.find('video').exists()).toBe(true);
  });

  it('renders <video> when item.data ends in .mp4 (no url)', () => {
    const wrapper = mountMedia([{ data: 'blob:origin/some-id.mp4' }]);
    expect(wrapper.find('video').exists()).toBe(true);
  });

  it('sets video src from item.url', () => {
    const url = 'https://cdn.example.com/clip.mp4';
    const wrapper = mountMedia([{ url }]);
    expect(wrapper.find('video').attributes('src')).toBe(url);
  });

  it('sets video src from item.data when url is absent', () => {
    const data = 'data:video/mp4;base64,abc123==';
    const wrapper = mountMedia([{ type: 'video/mp4', data }]);
    expect(wrapper.find('video').attributes('src')).toBe(data);
  });

  it('video element has controls attribute', () => {
    const wrapper = mountMedia([{ type: 'video/mp4', url: 'https://cdn.example.com/clip.mp4' }]);
    expect(wrapper.find('video').attributes('controls')).toBeDefined();
  });
});

// ── URL extension matching — case insensitivity ────────────────────────────────

describe('ListingMedia — case-insensitive extension matching', () => {
  it('renders <video> for uppercase .MP4 extension in url', () => {
    const wrapper = mountMedia([{ url: 'https://cdn.example.com/VIDEO.MP4' }]);
    expect(wrapper.find('video').exists()).toBe(true);
  });

  it('renders <video> for mixed-case .Webm extension in url', () => {
    const wrapper = mountMedia([{ url: 'https://cdn.example.com/clip.Webm' }]);
    expect(wrapper.find('video').exists()).toBe(true);
  });
});

// ── URL with query strings / fragments ────────────────────────────────────────

describe('ListingMedia — url with query params or fragments', () => {
  it('renders <video> for .mp4 url followed by query string', () => {
    const wrapper = mountMedia([{ url: 'https://cdn.example.com/video.mp4?v=1&t=0' }]);
    expect(wrapper.find('video').exists()).toBe(true);
  });

  it('renders <video> for .mp4 url followed by fragment', () => {
    const wrapper = mountMedia([{ url: 'https://cdn.example.com/video.mp4#section' }]);
    expect(wrapper.find('video').exists()).toBe(true);
  });

  it('renders <img> for .jpg url followed by query string', () => {
    const wrapper = mountMedia([{ url: 'https://example.com/photo.jpg?w=800' }]);
    expect(wrapper.find('img').exists()).toBe(true);
    expect(wrapper.find('video').exists()).toBe(false);
  });
});

// ── N items render N elements ──────────────────────────────────────────────────

describe('ListingMedia — N items render N elements', () => {
  it('renders exactly N elements for N media items (all images)', () => {
    const media = [
      { url: 'https://example.com/a.jpg' },
      { url: 'https://example.com/b.jpg' },
      { url: 'https://example.com/c.png' },
    ];
    const wrapper = mountMedia(media);
    expect(wrapper.findAll('img').length).toBe(3);
    expect(wrapper.findAll('video').length).toBe(0);
  });

  it('renders exactly N elements for N media items (all videos)', () => {
    const media = [
      { type: 'video/mp4', url: 'https://cdn.example.com/a.mp4' },
      { url: 'https://cdn.example.com/b.webm' },
    ];
    const wrapper = mountMedia(media);
    expect(wrapper.findAll('video').length).toBe(2);
    expect(wrapper.findAll('img').length).toBe(0);
  });

  it('renders correct mix of img and video for mixed input', () => {
    const media = [
      { url: 'https://example.com/photo.jpg' },        // img
      { type: 'video/mp4', url: 'https://cdn.example.com/clip.mp4' }, // video
      { url: 'https://example.com/banner.png' },        // img
      { url: 'https://cdn.example.com/tour.mov' },      // video
      { url: 'https://example.com/thumb.gif' },          // img
    ];
    const wrapper = mountMedia(media);
    expect(wrapper.findAll('img').length).toBe(3);
    expect(wrapper.findAll('video').length).toBe(2);
  });

  it('renders total of N elements (img + video) for N items', () => {
    const media = [
      { url: 'https://example.com/a.jpg' },
      { type: 'video/webm', url: 'https://cdn.example.com/b.webm' },
      { url: 'https://example.com/c.png' },
      { url: 'https://cdn.example.com/d.mp4' },
    ];
    const wrapper = mountMedia(media);
    const total = wrapper.findAll('img').length + wrapper.findAll('video').length;
    expect(total).toBe(media.length);
  });

  it('renders a single img for a single image item', () => {
    const wrapper = mountMedia([{ url: 'https://example.com/solo.jpg' }]);
    expect(wrapper.findAll('img').length).toBe(1);
    expect(wrapper.findAll('video').length).toBe(0);
  });

  it('renders a single video for a single video item', () => {
    const wrapper = mountMedia([{ type: 'video/mp4', url: 'https://cdn.example.com/solo.mp4' }]);
    expect(wrapper.findAll('video').length).toBe(1);
    expect(wrapper.findAll('img').length).toBe(0);
  });
});

// ── media-thumb class ─────────────────────────────────────────────────────────

describe('ListingMedia — media-thumb class', () => {
  it('img element has media-thumb class', () => {
    const wrapper = mountMedia([{ url: 'https://example.com/a.jpg' }]);
    expect(wrapper.find('img').classes()).toContain('media-thumb');
  });

  it('video element has media-thumb class', () => {
    const wrapper = mountMedia([{ type: 'video/mp4', url: 'https://cdn.example.com/a.mp4' }]);
    expect(wrapper.find('video').classes()).toContain('media-thumb');
  });
});
