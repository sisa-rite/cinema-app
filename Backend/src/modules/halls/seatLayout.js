function getSeatNumber(number) {
  return number === 13 ? 14 : number;
}

export function generateSeatLayout(totalRows, seatsPerRow) {
  if (!Number.isInteger(totalRows) || totalRows < 1) {
    throw new RangeError("totalRows must be a positive integer");
  }
  if (!Number.isInteger(seatsPerRow) || seatsPerRow < 1) {
    throw new RangeError("seatsPerRow must be a positive integer");
  }

  const seats = [];
  let seatNumber = 1;
  let rowNumber = 1;

  for (let physicalRow = 1; physicalRow <= totalRows; physicalRow += 1) {
    if (rowNumber === 13) rowNumber = 14;

    for (let seatInRow = 0; seatInRow < seatsPerRow; seatInRow += 1) {
      seatNumber = getSeatNumber(seatNumber);
      const posX =
        physicalRow % 2 === 1 ? seatsPerRow - seatInRow : seatInRow + 1;

      seats.push({
        rowNumber,
        seatNumber,
        posX,
        posY: physicalRow,
        type: seatNumber === 1 ? "owner" : "normal",
      });

      seatNumber += 1;
    }

    rowNumber += 1;
  }

  return seats;
}
