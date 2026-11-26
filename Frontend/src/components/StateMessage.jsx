// headingRef lets a view move focus to the heading, e.g. after the button that led here is gone.
function StateMessage({ title, children, headingAs: Heading = "h2", headingRef, role }) {
  return (
    <div
      role={role}
      className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center"
    >
      <Heading
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
        className="font-display text-2xl font-bold text-rio-gold-light focus:outline-none sm:text-3xl"
      >
        {title}
      </Heading>
      {children}
    </div>
  );
}

export default StateMessage;
