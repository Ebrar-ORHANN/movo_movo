import {StyleSheet, Text, View, FlatList, Dimensions,TouchableOpacity,} from 'react-native';
import React, { useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import LottieView from 'lottie-react-native';
import { Ionicons } from '@expo/vector-icons';
import Logo from '../../../components/Logo';

const { width } = Dimensions.get('window');

const slides = [
  {
    id: '1',
    title: 'Keşfetmeye hazır mısın?',
    description: 'Doğa yürüyüşü, şehir turu veya kamp… Sana özel rota önerileri al.',
    animation: require('../../../assets/lottie/discover.json'),
  },
  {
    id: '2',
    title: 'Gezilerini paylaş ve topluluğa katıl',
    description: 'Fotoğraf, video, hikâye ve rotalarını paylaş.',
    animation: require('../../../assets/lottie/plan.json'),
  },
  {
    id: '3',
    title: 'Yapay Zekanın Rehberliğine Güven',
    description:
      'Doğal dil ile konuşarak plan yap. Hava durumu ve trafik analizleriyle en dinamik rotayı hemen oluştur.',
    animation: require('../../../assets/lottie/share.json'),
  },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);
  const router = useRouter();

  const onViewRef = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  });

  const goToNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    } else {
      router.replace('/(auth)/login');
    }
  };

  const skip = () => {
    router.replace('/(auth)/login');
  };

  return (
    <LinearGradient
      colors={['#0068B1', '#71ADD8', '#E2F2FF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.container}
    >
   
      {currentIndex < slides.length - 1 && (
        <TouchableOpacity style={styles.skipButton} onPress={skip}>
          <Text style={styles.skipText}>Atla</Text>
        </TouchableOpacity>
      )}

      <FlatList
        ref={flatListRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onViewableItemsChanged={onViewRef.current}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <View style={styles.slide}>
      
            <View style={styles.lottieCard}>
              <LottieView
                source={item.animation}
                autoPlay
                loop
                style={styles.lottie}
              />
            </View>

            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        )}
      />

     
      <View style={styles.bottomSection}>
      
        <View style={styles.pagination}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                currentIndex === index && styles.activeDot,
              ]}
            />
          ))}
        </View>
        <TouchableOpacity
          style={styles.nextButton}
          onPress={goToNext}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>
            {currentIndex === slides.length - 1 ? 'Başla' : 'İleri'}
          </Text>
          <Ionicons
            name={currentIndex === slides.length - 1 ? 'checkmark' : 'arrow-forward'}
            size={20}
            color="#FFF"
          />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skipButton: {
    position: 'absolute',
    top: 50,
    right: 24,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skipText: {
    color: '#e3e3e3',
    fontSize: 14,
    fontWeight: '600',
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 20,
  },
  slide: {
    width,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  lottieCard: {
    width: 300,
    height: 300,
    borderRadius: 24, 
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  lottie: {
    width: 240,
    height: 240,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0E0E0E',
    marginBottom: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 15,
    color: '#333',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 22,
  },
  bottomSection: {
    paddingBottom: 40,
    gap: 20,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    marginHorizontal: 6,
  },
  activeDot: {
    backgroundColor: '#0068B1',
    width: 24,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0068B1',
    marginHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: '#0068B1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  nextButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});