export const THEATRES = [
  {
    city: "oulu",
    label: "Oulu",
    name: "Cinema RIO Oulu",
    address: "Kauppurienkatu 45, 90100 Oulu, Finland",
    phone: "+358 8 5542 3890",
  },
  {
    city: "tampere",
    label: "Tampere",
    name: "Cinema RIO Tampere",
    address: "Hämeenkatu 27, 33100 Tampere, Finland",
    phone: "+358 2 2641 7520",
  },
];

export function findTheatre(city) {
  return THEATRES.find((theatre) => theatre.city === city);
}
