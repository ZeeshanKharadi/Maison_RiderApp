export interface Order {
  id: string;
  restaurant: string;
  distance: string;
  earnings: string;
  items: number;
  estTime: string;
  hot?: boolean;
  imageColor: string;
}

export const MOCK_ORDERS: Order[] = [
  {
    id: '1055',
    restaurant: 'The Burger House',
    distance: '0.8 miles away',
    earnings: '$12.50',
    items: 4,
    estTime: '22 min est.',
    imageColor: '#FFB74D',
  },
  {
    id: '1056',
    restaurant: 'Sakura Sushi Bar',
    distance: '1.2 miles away',
    earnings: '$18.75',
    items: 6,
    estTime: '28 min est.',
    hot: true,
    imageColor: '#E57373',
  },
  {
    id: '1057',
    restaurant: 'Pizza Palace',
    distance: '0.5 miles away',
    earnings: '$9.25',
    items: 2,
    estTime: '15 min est.',
    imageColor: '#81C784',
  },
  {
    id: '1058',
    restaurant: 'Taco Fiesta',
    distance: '1.5 miles away',
    earnings: '$14.20',
    items: 5,
    estTime: '25 min est.',
    imageColor: '#FFD54F',
  },
];
