function StateMessage({ title, children, headingAs: Heading = "h2", role }) {
  return (
    <div
      role={role}
      className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center"
    >
      <Heading className="font-display text-2xl font-bold text-rio-gold-light sm:text-3xl">
        {title}
      </Heading>
      {children}
    </div>
  );
}

export default StateMessage;
