import { Hymn } from '@/context/audio-context';

export const HYMNS: Hymn[] = [
  {
    id: '1',
    hymnNumber: 1,
    title: 'How Great Is Our God',
    artist: 'Chris Tomlin',
    artworkColor: '#1A6B9A',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    id: '2',
    hymnNumber: 2,
    title: 'Amazing Grace',
    artist: 'Traditional',
    artworkColor: '#6B3A1A',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    id: '3',
    hymnNumber: 3,
    title: 'Great Is Thy Faithfulness',
    artist: 'Thomas O. Chisholm',
    artworkColor: '#1A6B4A',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
  {
    id: '4',
    hymnNumber: 4,
    title: 'Be Thou My Vision',
    artist: 'Traditional Irish',
    artworkColor: '#6B1A5A',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
  {
    id: '5',
    hymnNumber: 5,
    title: 'Holy, Holy, Holy',
    artist: 'Reginald Heber',
    artworkColor: '#4A1A6B',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  },
  {
    id: '6',
    hymnNumber: 6,
    title: 'It Is Well With My Soul',
    artist: 'Horatio Spafford',
    artworkColor: '#6B5A1A',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  },
  {
    id: '7',
    hymnNumber: 7,
    title: 'Crown Him With Many Crowns',
    artist: 'Matthew Bridges',
    artworkColor: '#1A4A6B',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  },
  {
    id: '8',
    hymnNumber: 8,
    title: 'To God Be the Glory',
    artist: 'Fanny Crosby',
    artworkColor: '#6B1A1A',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
  },
  {
    id: '9',
    hymnNumber: 9,
    title: 'Blessed Assurance',
    artist: 'Fanny Crosby',
    artworkColor: '#1A6B6B',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
  },
  {
    id: '10',
    hymnNumber: 10,
    title: 'Abide With Me',
    artist: 'Henry F. Lyte',
    artworkColor: '#3A6B1A',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
  },
];

export const HYMN_OF_THE_DAY = HYMNS[0];
export const POPULAR_HYMNS = HYMNS.slice(0, 5);
export const RECENTLY_PLAYED = HYMNS.slice(1, 5);
