// ── hooks/useFeed.js ─────────────────────────────────────────────────────────
// posts, likes, saves, events — gerçek API bağlantısı
import { useState, useEffect, useCallback } from 'react';
import { fetchFeed, likeContent, unlikeContent, saveContent, unsaveContent } from '../services/feedService';
import { getNearbyEvents } from '../services/eventService';

export default function useFeed() {
  const [posts, setPosts]       = useState([]);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [before, setBefore]     = useState(null);
  const [hasMore, setHasMore]   = useState(true);

  const loadFeed = useCallback(async (cursor = null, isRefresh = false) => {
    try {
      if (!cursor) isRefresh ? setRefreshing(true) : setLoading(true);
      const [feedPosts, nearbyEvents] = await Promise.all([
        fetchFeed(cursor),
        cursor ? Promise.resolve([]) : getNearbyEvents(39.9, 32.8),
      ]);
      if (!cursor) {
        setPosts(feedPosts);
        if (nearbyEvents.length) setEvents(nearbyEvents);
      } else {
        setPosts(prev => [...prev, ...feedPosts]);
      }
      const last = feedPosts[feedPosts.length - 1];
      setBefore(last?.created_at || null);
      setHasMore(feedPosts.length >= 20);
    } catch (e) { console.warn('Feed:', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  const refresh  = () => { setBefore(null); loadFeed(null, true); };
  const loadMore = () => { if (hasMore && !loading) loadFeed(before); };

  const toggleLike = useCallback((postId, liked) => {
    setPosts(p => p.map(x => x.id===postId ? {...x, is_liked:!liked, like_cnt:x.like_cnt+(liked?-1:1)} : x));
    liked ? unlikeContent('post', postId) : likeContent('post', postId);
  }, []);

  const toggleSave = useCallback((postId, saved) => {
    setPosts(p => p.map(x => x.id===postId ? {...x, is_saved:!saved} : x));
    saved ? unsaveContent('post', postId) : saveContent('post', postId);
  }, []);

  return { posts, events, loading, refreshing, hasMore, refresh, loadMore, toggleLike, toggleSave };
}
