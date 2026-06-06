import { Hymn } from '@/context/audio-context';

const SHARED_CHORUS = [
  'Sing with joy, lift voices high,',
  'Praise resounding to the sky.',
  'Hope and peace forever stay,',
  'Love will lead us on our way.',
];

export const HYMNS: Hymn[] = [
  {
    id: '1',
    hymnNumber: 77,
    title: 'How Great Is Our God',
    artist: 'Anthony Barrera',
    artworkColor: '#1A6B9A',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    lyrics: [
      {
        type: 'verse',
        number: 1,
        lines: [
          'Light of mercy, shining bright,',
          'Guide us through the darkest night.',
          'Hands of grace, our hearts renew,',
          'Lead us in all that we do.',
        ],
      },
      { type: 'chorus', lines: SHARED_CHORUS },
      {
        type: 'verse',
        number: 2,
        lines: [
          'When the road is long and steep,',
          'You are near our souls to keep.',
          'Strength and comfort you provide,',
          'Ever faithful at our side.',
        ],
      },
      { type: 'chorus', lines: SHARED_CHORUS },
      {
        type: 'verse',
        number: 3,
        lines: [
          'In the morning, in the night,',
          'You remain our guiding light.',
          'Every breath a gift from you,',
          'Every day your mercies new.',
        ],
      },
      { type: 'chorus', lines: SHARED_CHORUS },
    ],
  },
  {
    id: '2',
    hymnNumber: 2,
    title: 'Amazing Grace',
    artist: 'Traditional',
    artworkColor: '#6B3A1A',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    lyrics: [
      {
        type: 'verse',
        number: 1,
        lines: [
          'Amazing grace, how sweet the sound,',
          'That saved a wretch like me.',
          'I once was lost, but now am found,',
          "Was blind, but now I see.",
        ],
      },
      {
        type: 'verse',
        number: 2,
        lines: [
          "'Twas grace that taught my heart to fear,",
          'And grace my fears relieved.',
          'How precious did that grace appear,',
          'The hour I first believed.',
        ],
      },
    ],
  },
  {
    id: '3',
    hymnNumber: 3,
    title: 'Great Is Thy Faithfulness',
    artist: 'Thomas O. Chisholm',
    artworkColor: '#1A6B4A',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    lyrics: [
      {
        type: 'verse',
        number: 1,
        lines: [
          'Great is thy faithfulness, O God my Father,',
          'There is no shadow of turning with thee.',
          'Thou changest not, thy compassions they fail not,',
          'As thou hast been thou forever wilt be.',
        ],
      },
      {
        type: 'chorus',
        lines: [
          'Great is thy faithfulness!',
          'Great is thy faithfulness!',
          'Morning by morning new mercies I see.',
          'All I have needed thy hand hath provided,',
          'Great is thy faithfulness, Lord, unto me.',
        ],
      },
    ],
  },
  {
    id: '4',
    hymnNumber: 4,
    title: 'Be Thou My Vision',
    artist: 'Traditional Irish',
    artworkColor: '#6B1A5A',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    lyrics: [
      {
        type: 'verse',
        number: 1,
        lines: [
          'Be thou my vision, O Lord of my heart,',
          'Naught be all else to me, save that thou art.',
          'Thou my best thought, by day or by night,',
          'Waking or sleeping, thy presence my light.',
        ],
      },
      {
        type: 'verse',
        number: 2,
        lines: [
          'Be thou my wisdom, and thou my true word,',
          'I ever with thee and thou with me, Lord.',
          'Thou my great Father; thine own may I be,',
          'Thou in me dwelling and I one with thee.',
        ],
      },
      {
        type: 'verse',
        number: 3,
        lines: [
          'Riches I heed not, nor vain empty praise,',
          'Thou mine inheritance, now and always.',
          'Thou and thou only, first in my heart,',
          'High King of heaven, my treasure thou art.',
        ],
      },
    ],
  },
  {
    id: '5',
    hymnNumber: 5,
    title: 'Holy, Holy, Holy',
    artist: 'Reginald Heber',
    artworkColor: '#4A1A6B',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    lyrics: [
      {
        type: 'verse',
        number: 1,
        lines: [
          'Holy, holy, holy! Lord God Almighty!',
          'Early in the morning our song shall rise to thee.',
          'Holy, holy, holy! Merciful and mighty,',
          'God in three persons, blessed Trinity.',
        ],
      },
      {
        type: 'verse',
        number: 2,
        lines: [
          'Holy, holy, holy! All the saints adore thee,',
          'Casting down their golden crowns around the glassy sea.',
          'Cherubim and seraphim falling down before thee,',
          'Who wert and art and evermore shalt be.',
        ],
      },
      {
        type: 'verse',
        number: 3,
        lines: [
          'Holy, holy, holy! Though the darkness hide thee,',
          'Though the eye made blind by sin thy glory may not see,',
          'Only thou art holy; there is none beside thee,',
          'Perfect in power, in love and purity.',
        ],
      },
    ],
  },
  {
    id: '6',
    hymnNumber: 6,
    title: 'It Is Well With My Soul',
    artist: 'Horatio Spafford',
    artworkColor: '#6B5A1A',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
    lyrics: [
      {
        type: 'verse',
        number: 1,
        lines: [
          'When peace like a river attendeth my way,',
          'When sorrows like sea billows roll,',
          'Whatever my lot, thou hast taught me to say,',
          'It is well, it is well with my soul.',
        ],
      },
      {
        type: 'chorus',
        lines: [
          'It is well with my soul,',
          'It is well, it is well with my soul.',
        ],
      },
      {
        type: 'verse',
        number: 2,
        lines: [
          'Though Satan should buffet, though trials should come,',
          'Let this blest assurance control,',
          'That Christ hath regarded my helpless estate,',
          'And hath shed his own blood for my soul.',
        ],
      },
      { type: 'chorus', lines: ['It is well with my soul,', 'It is well, it is well with my soul.'] },
      {
        type: 'verse',
        number: 3,
        lines: [
          'And, Lord, haste the day when my faith shall be sight,',
          'The clouds be rolled back as a scroll,',
          'The trump shall resound and the Lord shall descend,',
          'Even so, it is well with my soul.',
        ],
      },
      { type: 'chorus', lines: ['It is well with my soul,', 'It is well, it is well with my soul.'] },
    ],
  },
  {
    id: '7',
    hymnNumber: 7,
    title: 'Crown Him With Many Crowns',
    artist: 'Matthew Bridges',
    artworkColor: '#1A4A6B',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
    lyrics: [
      {
        type: 'verse',
        number: 1,
        lines: [
          'Crown him with many crowns,',
          'The Lamb upon his throne.',
          'Hark! how the heavenly anthem drowns',
          'All music but its own.',
        ],
      },
      {
        type: 'verse',
        number: 2,
        lines: [
          'Crown him the Lord of life,',
          'Who triumphed o\'er the grave,',
          'And rose victorious in the strife',
          'For those he came to save.',
        ],
      },
      {
        type: 'verse',
        number: 3,
        lines: [
          'Crown him the Lord of love;',
          'Behold his hands and side,',
          'Rich wounds, yet visible above,',
          'In beauty glorified.',
        ],
      },
    ],
  },
  {
    id: '8',
    hymnNumber: 8,
    title: 'To God Be the Glory',
    artist: 'Fanny Crosby',
    artworkColor: '#6B1A1A',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    lyrics: [
      {
        type: 'verse',
        number: 1,
        lines: [
          'To God be the glory, great things he hath taught us,',
          'Great things he hath done, and great our rejoicing.',
          'Through Jesus the Son, and blindly we stray,',
          'But he leads his children in marvelous ways.',
        ],
      },
      {
        type: 'chorus',
        lines: [
          'Praise the Lord, praise the Lord,',
          'Let the earth hear his voice!',
          'Praise the Lord, praise the Lord,',
          'Let the people rejoice!',
        ],
      },
      {
        type: 'verse',
        number: 2,
        lines: [
          'Oh, perfect redemption, the purchase of blood,',
          'To every believer the promise of God.',
          'The vilest offender who truly believes,',
          'That moment from Jesus a pardon receives.',
        ],
      },
      {
        type: 'chorus',
        lines: [
          'Praise the Lord, praise the Lord,',
          'Let the earth hear his voice!',
          'Praise the Lord, praise the Lord,',
          'Let the people rejoice!',
        ],
      },
    ],
  },
  {
    id: '9',
    hymnNumber: 9,
    title: 'Blessed Assurance',
    artist: 'Fanny Crosby',
    artworkColor: '#1A6B6B',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
    lyrics: [
      {
        type: 'verse',
        number: 1,
        lines: [
          'Blessed assurance, Jesus is mine!',
          'Oh, what a foretaste of glory divine!',
          'Heir of salvation, purchase of God,',
          'Born of his Spirit, washed in his blood.',
        ],
      },
      {
        type: 'chorus',
        lines: [
          'This is my story, this is my song,',
          'Praising my Savior all the day long.',
          'This is my story, this is my song,',
          'Praising my Savior all the day long.',
        ],
      },
      {
        type: 'verse',
        number: 2,
        lines: [
          'Perfect submission, perfect delight,',
          'Visions of rapture now burst on my sight.',
          'Angels descending bring from above',
          'Echoes of mercy, whispers of love.',
        ],
      },
      {
        type: 'chorus',
        lines: [
          'This is my story, this is my song,',
          'Praising my Savior all the day long.',
          'This is my story, this is my song,',
          'Praising my Savior all the day long.',
        ],
      },
    ],
  },
  {
    id: '10',
    hymnNumber: 10,
    title: 'Abide With Me',
    artist: 'Henry F. Lyte',
    artworkColor: '#3A6B1A',
    audioUri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
    lyrics: [
      {
        type: 'verse',
        number: 1,
        lines: [
          'Abide with me; fast falls the eventide.',
          'The darkness deepens; Lord, with me abide.',
          'When other helpers fail and comforts flee,',
          'Help of the helpless, oh, abide with me.',
        ],
      },
      {
        type: 'verse',
        number: 2,
        lines: [
          'Swift to its close ebbs out life\'s little day.',
          'Earth\'s joys grow dim; its glories pass away.',
          'Change and decay in all around I see.',
          'O thou who changest not, abide with me.',
        ],
      },
      {
        type: 'verse',
        number: 3,
        lines: [
          'I need thy presence every passing hour.',
          'What but thy grace can foil the tempter\'s power?',
          'Who like thyself my guide and stay can be?',
          'Through cloud and sunshine, Lord, abide with me.',
        ],
      },
      {
        type: 'verse',
        number: 4,
        lines: [
          'Hold thou thy cross before my closing eyes.',
          'Shine through the gloom and point me to the skies.',
          'Heaven\'s morning breaks and earth\'s vain shadows flee.',
          'In life, in death, O Lord, abide with me.',
        ],
      },
    ],
  },
];

export const HYMN_OF_THE_DAY = HYMNS[0];
export const POPULAR_HYMNS = HYMNS.slice(0, 5);
export const RECENTLY_PLAYED = HYMNS.slice(1, 5);
