// ── hooks/useFeed.js ─────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from 'react';
import { likeContent, unlikeContent, saveContent, unsaveContent } from '../services/feedService';
import { getNearbyEvents } from '../services/eventService';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

async function safeFetchFeed(cursor) {
  try {
    const path = `/social/feed${cursor ? `?before=${cursor}` : ''}`;
    const result = await api.get(path);
    return Array.isArray(result) ? result : [];
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('404') || msg.includes('HTTP 404')) {
      return null;
    }
    throw err;
  }
}

export default function useFeed() {
  const authCtx = useAuth();
  const firebaseUser = authCtx?.firebaseUser;
  const authLoading  = authCtx?.loading;

  const [posts, setPosts]           = useState([]);
  const [events, setEvents]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [before, setBefore]         = useState(null);
  const [hasMore, setHasMore]       = useState(false);

  const feedDisabled = useRef(false);

  const loadFeed = useCallback(async (cursor = null, isRefresh = false) => {
    if (feedDisabled.current && !isRefresh) return;

    try {
      if (!cursor) isRefresh ? setRefreshing(true) : setLoading(true);

      const [feedResult, nearbyEvents] = await Promise.all([
        safeFetchFeed(cursor),
        cursor ? Promise.resolve([]) : getNearbyEvents(39.9, 32.8).catch(() => []),
      ]);

      if (feedResult === null) {
        feedDisabled.current = true;
        setHasMore(false);
        if (!cursor && nearbyEvents.length) setEvents(nearbyEvents);
        return;
      }

      if (!cursor) {
        setPosts(feedResult);
        if (nearbyEvents.length) setEvents(nearbyEvents);
      } else {
        setPosts(prev => [...prev, ...feedResult]);
      }

      const last = feedResult[feedResult.length - 1];
      setBefore(last?.created_at || null);
      setHasMore(feedResult.length >= 20);
    } catch (e) {
      console.warn('Feed yüklenemedi:', e.message);
      setHasMore(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && firebaseUser) loadFeed();
  }, [loadFeed, authLoading, firebaseUser]);

  const refresh = () => {
    feedDisabled.current = false;
    setBefore(null);
    loadFeed(null, true);
  };

  const loadMore = () => {
    if (hasMore && !loading && !refreshing) loadFeed(before);
  };

  const toggleLike = useCallback((postId, liked) => {
    setPosts(p => p.map(x => x.id === postId
      ? { ...x, is_liked: !liked, like_cnt: x.like_cnt + (liked ? -1 : 1) }
      : x));
    liked ? unlikeContent('post', postId) : likeContent('post', postId);
  }, []);

  const toggleSave = useCallback((postId, saved) => {
    setPosts(p => p.map(x => x.id === postId ? { ...x, is_saved: !saved } : x));
    saved ? unsaveContent('post', postId) : saveContent('post', postId);
  }, []);

  return { posts, events, loading, refreshing, hasMore, refresh, loadMore, toggleLike, toggleSave };
}