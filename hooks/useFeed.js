// ── hooks/useFeed.js ─────────────────────────────────────────────────────────
import { useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { likeContent, unlikeContent, saveContent, unsaveContent } from '../services/feedService';
import { api } from '../services/api';

const getFeed = (cursor = null, limit = 15) => {
  const q = cursor ? `?before=${cursor}&limit=${limit}` : `?limit=${limit}`;
  return api.get(`/social/feed${q}`);
};

export default function useFeed() {
  const authCtx      = useAuth();
  const firebaseUser = authCtx?.firebaseUser;
  const authLoading  = authCtx?.loading;

  const [posts, setPosts]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore]       = useState(true);
  const [error, setError]           = useState(null);
  const cursorRef                   = useRef(null);
  const loadingRef                  = useRef(false);

  const loadFeed = useCallback(async (refresh = false) => {
    if (!firebaseUser || authLoading) return;
    if (loadingRef.current) return;
    loadingRef.current = true;

    if (refresh) { setRefreshing(true); cursorRef.current = null; }
    else { setLoading(true); }
    setError(null);

    try {
      const data     = await getFeed(refresh ? null : cursorRef.current);
      const newPosts = data?.posts || data || [];

      if (refresh) {
        setPosts(newPosts);
      } else {
        setPosts(prev => {
          const ids = new Set(prev.map(p => p.id));
          return [...prev, ...newPosts.filter(p => !ids.has(p.id))];
        });
      }
      cursorRef.current = data?.next_cursor || null;
      setHasMore(!!data?.next_cursor && newPosts.length > 0);
    } catch (e) {
      setError(e.message);
      console.warn('Feed yüklenemedi:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadingRef.current = false;
    }
  }, [firebaseUser, authLoading]);

  const refresh  = useCallback(() => loadFeed(true), [loadFeed]);
  const loadMore = useCallback(() => {
    if (hasMore && !loadingRef.current) loadFeed(false);
  }, [hasMore, loadFeed]);

  const toggleLike = useCallback(async (postId, currentlyLiked) => {
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, liked: !currentlyLiked, like_cnt: p.like_cnt + (currentlyLiked ? -1 : 1) } : p
    ));
    try {
      if (currentlyLiked) await unlikeContent('post', postId);
      else                await likeContent('post', postId);
    } catch {
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, liked: currentlyLiked, like_cnt: p.like_cnt + (currentlyLiked ? 1 : -1) } : p
      ));
    }
  }, []);

  const toggleSave = useCallback(async (postId, currentlySaved) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, saved: !currentlySaved } : p));
    try {
      if (currentlySaved) await unsaveContent('post', postId);
      else                await saveContent('post', postId);
    } catch {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, saved: currentlySaved } : p));
    }
  }, []);

  const prependPost = useCallback((post) => {
    setPosts(prev => [post, ...prev]);
  }, []);

  const removePost = useCallback((postId) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  }, []);

  const editPost = useCallback((postId, newNote) => {
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, user_note: newNote } : p
    ));
  }, []);

  return {
    posts, loading, refreshing, hasMore, error,
    loadFeed, refresh, loadMore,
    toggleLike, toggleSave, prependPost, removePost, editPost,
  };
}