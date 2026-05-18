// ── context/LanguageContext.js ────────────────────────────────────────────────
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

// ── Çeviriler ─────────────────────────────────────────────────────────────────
const translations = {
  tr: {
    // Genel
    save:        'Kaydet',
    cancel:      'İptal',
    delete:      'Sil',
    edit:        'Düzenle',
    loading:     'Yükleniyor…',
    error:       'Hata',
    success:     'Başarılı',
    soon:        'Yakında',

    // Tab bar
    feed:        'Akış',
    explore:     'Keşfet',
    profile:     'Profil',

    // Feed
    feedEmpty:   'Henüz gönderi yok',
    feedEmptyDesc:'Birilerini takip et veya ilk gönderini paylaş!',
    sharePost:   'Gönderi Paylaş',
    newPost:     'Yeni Gönderi',
    share:       'Paylaş',
    comments:    'Yorumlar',
    writeComment:'Yorum yaz…',
    noComments:  'Henüz yorum yok. İlk yorumu sen yap!',

    // Profil
    profileTitle:  'Profil',
    editProfile:   'Profili Düzenle',
    posts:         'Gönderiler',
    routes:        'Rotalar',
    saved:         'Kaydedilenler',
    followers:     'Takipçi',
    following:     'Takip',
    km:            'Km',
    noRoutes:      'Henüz rota yok',
    noSaved:       'Kaydedilen içerik yok',
    noPosts:       'Henüz gönderi yok',
    editLongPress: 'Düzenlemek için uzun bas',

    // Ayarlar
    settings:      'Ayarlar',
    account:       'Hesap',
    privacy:       'Gizlilik',
    language:      'Dil',
    notifications: 'Bildirimler',
    help:          'Yardım & Destek',
    rateApp:       'Uygulamayı Değerlendir',
    logout:        'Çıkış Yap',
    deleteAccount: 'Hesabı Sil',
    logoutConfirm: 'Hesabından çıkmak istediğine emin misin?',

    // Gizlilik seçenekleri
    public:          'Herkese Açık',
    publicDesc:      'Uygulamayı kullanan herkes profilini görebilir',
    followersOnly:   'Sadece Takipçiler',
    followersDesc:   'Yalnızca seni takip edenler görebilir',
    private:         'Gizli',
    privateDesc:     'Profilin kimseye görünmez',

    // Post
    postOptions:   'Gönderi Seçenekleri',
    editPost:      'Gönderiyi Düzenle',
    deletePost:    'Gönderiyi Sil',
    deletePostConfirm: 'Bu gönderi kalıcı olarak silinecek. Emin misin?',
    report:        'Şikayet Et',
    shared:        '✅ Paylaşıldı!',
    postLive:      'Gönderiniz yayında.',

    // Story
    addStory:      'Ekle',
    yourStory:     'Senin',
    storyShare:    'Story Paylaş',
    storyAuto:     '24 saat sonra otomatik silinir',
    camera:        'Kamera',
    gallery:       'Galeri',
  },

  en: {
    save:        'Save',
    cancel:      'Cancel',
    delete:      'Delete',
    edit:        'Edit',
    loading:     'Loading…',
    error:       'Error',
    success:     'Success',
    soon:        'Coming soon',

    feed:        'Feed',
    explore:     'Explore',
    profile:     'Profile',

    feedEmpty:   'No posts yet',
    feedEmptyDesc:'Follow someone or share your first post!',
    sharePost:   'Share Post',
    newPost:     'New Post',
    share:       'Share',
    comments:    'Comments',
    writeComment:'Write a comment…',
    noComments:  'No comments yet. Be the first!',

    profileTitle:  'Profile',
    editProfile:   'Edit Profile',
    posts:         'Posts',
    routes:        'Routes',
    saved:         'Saved',
    followers:     'Followers',
    following:     'Following',
    km:            'Km',
    noRoutes:      'No routes yet',
    noSaved:       'No saved content',
    noPosts:       'No posts yet',
    editLongPress: 'Long press to edit',

    settings:      'Settings',
    account:       'Account',
    privacy:       'Privacy',
    language:      'Language',
    notifications: 'Notifications',
    help:          'Help & Support',
    rateApp:       'Rate the App',
    logout:        'Log Out',
    deleteAccount: 'Delete Account',
    logoutConfirm: 'Are you sure you want to log out?',

    public:          'Public',
    publicDesc:      'Everyone using the app can see your profile',
    followersOnly:   'Followers Only',
    followersDesc:   'Only your followers can see your profile',
    private:         'Private',
    privateDesc:     'Nobody can see your profile',

    postOptions:   'Post Options',
    editPost:      'Edit Post',
    deletePost:    'Delete Post',
    deletePostConfirm: 'This post will be permanently deleted. Are you sure?',
    report:        'Report',
    shared:        '✅ Shared!',
    postLive:      'Your post is live.',

    addStory:      'Add',
    yourStory:     'Your Story',
    storyShare:    'Share Story',
    storyAuto:     'Auto-deletes after 24 hours',
    camera:        'Camera',
    gallery:       'Gallery',
  },

  de: {
    save:        'Speichern',
    cancel:      'Abbrechen',
    delete:      'Löschen',
    edit:        'Bearbeiten',
    loading:     'Laden…',
    error:       'Fehler',
    success:     'Erfolg',
    soon:        'Demnächst',

    feed:        'Feed',
    explore:     'Entdecken',
    profile:     'Profil',

    feedEmpty:   'Noch keine Beiträge',
    feedEmptyDesc:'Folge jemandem oder teile deinen ersten Beitrag!',
    sharePost:   'Beitrag teilen',
    newPost:     'Neuer Beitrag',
    share:       'Teilen',
    comments:    'Kommentare',
    writeComment:'Kommentar schreiben…',
    noComments:  'Noch keine Kommentare.',

    profileTitle:  'Profil',
    editProfile:   'Profil bearbeiten',
    posts:         'Beiträge',
    routes:        'Routen',
    saved:         'Gespeichert',
    followers:     'Follower',
    following:     'Folge ich',
    km:            'Km',
    noRoutes:      'Noch keine Routen',
    noSaved:       'Keine gespeicherten Inhalte',
    noPosts:       'Noch keine Beiträge',
    editLongPress: 'Lang drücken zum Bearbeiten',

    settings:      'Einstellungen',
    account:       'Konto',
    privacy:       'Datenschutz',
    language:      'Sprache',
    notifications: 'Benachrichtigungen',
    help:          'Hilfe & Support',
    rateApp:       'App bewerten',
    logout:        'Abmelden',
    deleteAccount: 'Konto löschen',
    logoutConfirm: 'Möchtest du dich wirklich abmelden?',

    public:          'Öffentlich',
    publicDesc:      'Jeder kann dein Profil sehen',
    followersOnly:   'Nur Follower',
    followersDesc:   'Nur deine Follower können dein Profil sehen',
    private:         'Privat',
    privateDesc:     'Niemand kann dein Profil sehen',

    postOptions:   'Beitragsoptionen',
    editPost:      'Beitrag bearbeiten',
    deletePost:    'Beitrag löschen',
    deletePostConfirm: 'Dieser Beitrag wird dauerhaft gelöscht. Bist du sicher?',
    report:        'Melden',
    shared:        '✅ Geteilt!',
    postLive:      'Dein Beitrag ist live.',

    addStory:      'Hinzufügen',
    yourStory:     'Deine Story',
    storyShare:    'Story teilen',
    storyAuto:     'Wird nach 24 Stunden automatisch gelöscht',
    camera:        'Kamera',
    gallery:       'Galerie',
  },

  fr: {
    save:        'Enregistrer',
    cancel:      'Annuler',
    delete:      'Supprimer',
    edit:        'Modifier',
    loading:     'Chargement…',
    error:       'Erreur',
    success:     'Succès',
    soon:        'Bientôt',

    feed:        'Fil',
    explore:     'Explorer',
    profile:     'Profil',

    feedEmpty:   'Aucune publication',
    feedEmptyDesc:'Suivez quelqu\'un ou partagez votre première publication!',
    sharePost:   'Partager',
    newPost:     'Nouvelle publication',
    share:       'Partager',
    comments:    'Commentaires',
    writeComment:'Écrire un commentaire…',
    noComments:  'Aucun commentaire pour l\'instant.',

    profileTitle:  'Profil',
    editProfile:   'Modifier le profil',
    posts:         'Publications',
    routes:        'Itinéraires',
    saved:         'Enregistrés',
    followers:     'Abonnés',
    following:     'Abonnements',
    km:            'Km',
    noRoutes:      'Aucun itinéraire',
    noSaved:       'Aucun contenu enregistré',
    noPosts:       'Aucune publication',
    editLongPress: 'Appuyer longuement pour modifier',

    settings:      'Paramètres',
    account:       'Compte',
    privacy:       'Confidentialité',
    language:      'Langue',
    notifications: 'Notifications',
    help:          'Aide & Support',
    rateApp:       'Noter l\'application',
    logout:        'Se déconnecter',
    deleteAccount: 'Supprimer le compte',
    logoutConfirm: 'Voulez-vous vraiment vous déconnecter?',

    public:          'Public',
    publicDesc:      'Tout le monde peut voir votre profil',
    followersOnly:   'Abonnés uniquement',
    followersDesc:   'Seuls vos abonnés peuvent voir votre profil',
    private:         'Privé',
    privateDesc:     'Personne ne peut voir votre profil',

    postOptions:   'Options de publication',
    editPost:      'Modifier la publication',
    deletePost:    'Supprimer la publication',
    deletePostConfirm: 'Cette publication sera supprimée définitivement. Êtes-vous sûr?',
    report:        'Signaler',
    shared:        '✅ Partagé!',
    postLive:      'Votre publication est en ligne.',

    addStory:      'Ajouter',
    yourStory:     'Votre Story',
    storyShare:    'Partager la Story',
    storyAuto:     'Supprimée automatiquement après 24 heures',
    camera:        'Appareil photo',
    gallery:       'Galerie',
  },
};

// ── Context ───────────────────────────────────────────────────────────────────
const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const { profile } = useAuth();
  const [lang, setLang] = useState('tr');

  useEffect(() => {
    if (profile?.preferred_language) {
      setLang(profile.preferred_language);
    }
  }, [profile?.preferred_language]);

  const t = (key) => translations[lang]?.[key] || translations['tr']?.[key] || key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
export default LanguageContext;