function FaqButton(props: { onClick: () => void, text: string }) {
    return (
        <button
            className="h-full flex items-center justify-center text-center 
                       bg-primary hover:bg-primary/90 
                       text-white font-semibold 
                       text-xs md:text-sm 
                       py-2 px-2 md:px-3 
                       rounded-xl"
            onClick={props.onClick}
        >
            {props.text}
        </button>
    )
}

export default FaqButton